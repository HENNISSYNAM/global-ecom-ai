-- Storefronts and versions.
--
-- Draft/public separation: each storefront has exactly one editable draft version. Publishing copies the draft
-- (theme, sections, brand) together with a snapshot of the approved catalog into a new immutable published
-- version and moves storefronts.published_version_id. Public pages read only that published version, so editing
-- the draft or the catalog never changes what visitors see until the next publish, and a rollback restores
-- layout and catalog content together.

create type public.storefront_status as enum ('draft', 'live', 'paused');
create type public.storefront_version_kind as enum ('draft', 'published');

create table public.storefronts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  name text not null check (length(btrim(name)) between 1 and 200),
  status public.storefront_status not null default 'draft',
  published_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (status <> 'live' or published_version_id is not null)
);

create table public.storefront_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  storefront_id uuid not null,
  kind public.storefront_version_kind not null,
  version_no integer check (version_no > 0),
  -- Optimistic concurrency counter for the draft; bumped on every draft update.
  revision integer not null default 1,
  schema_version text not null default 'storefront.v1' check (schema_version ~ '^storefront\.v[0-9]+$'),
  theme jsonb not null default '{}'::jsonb check (jsonb_typeof(theme) = 'object'),
  brand jsonb not null default '{}'::jsonb check (jsonb_typeof(brand) = 'object'),
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  catalog jsonb check (catalog is null or jsonb_typeof(catalog) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_by uuid,
  published_at timestamptz,
  unique (tenant_id, id),
  unique (id, storefront_id),
  unique (storefront_id, version_no),
  foreign key (tenant_id, storefront_id) references public.storefronts (tenant_id, id) on delete cascade,
  check (
    (kind = 'draft' and version_no is null and catalog is null and published_at is null)
    or (kind = 'published' and version_no is not null and catalog is not null and published_at is not null)
  )
);
create unique index storefront_versions_one_draft on public.storefront_versions (storefront_id) where kind = 'draft';

-- The published pointer must reference a published version of the same storefront.
alter table public.storefronts
  add constraint storefronts_published_version_fk
  foreign key (published_version_id, id) references public.storefront_versions (id, storefront_id);

create function private.storefront_version_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.kind = 'published' then
    raise exception 'published versions are immutable' using errcode = '42501';
  end if;
  if new.kind <> old.kind or new.storefront_id <> old.storefront_id then
    raise exception 'draft identity is immutable' using errcode = '42501';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger storefront_versions_guard before update on public.storefront_versions
  for each row execute function private.storefront_version_guard();
create trigger storefront_versions_tenant_immutable before update on public.storefront_versions
  for each row execute function private.prevent_tenant_change();
create trigger storefronts_tenant_immutable before update on public.storefronts
  for each row execute function private.prevent_tenant_change();
create trigger storefronts_touch before update on public.storefronts
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Catalog snapshot: only approved products, only public+approved images, only evidence marked public.
-- Quantities and prices are serialized as strings to keep decimal/bigint precision exact.
-- ---------------------------------------------------------------------------

create function private.build_catalog_snapshot(p_tenant uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'schemaVersion', 'catalog-snapshot.v1',
    'generatedAt', now(),
    'assets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'bucket', a.bucket, 'objectKey', a.object_key, 'alt', a.alt_text,
        'width', a.width, 'height', a.height, 'kind', a.kind
      ) order by a.created_at)
      from public.assets a
      where a.tenant_id = p_tenant and a.visibility = 'public' and a.review_status = 'approved'
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'slug', p.slug,
        'name', p.name,
        'category', p.category,
        'processing', p.processing,
        'summary', p.summary,
        'description', p.description,
        'originCountry', p.origin_country,
        'originRegion', p.origin_region,
        'storageInstructions', p.storage_instructions,
        'shelfLifeNote', p.shelf_life_note,
        'approvedAt', p.approved_at,
        'imageAssetIds', coalesce((
          select jsonb_agg(pa.asset_id order by pa.position)
          from public.product_assets pa
          join public.assets a on a.tenant_id = pa.tenant_id and a.id = pa.asset_id
          where pa.tenant_id = p.tenant_id and pa.product_id = p.id
            and a.visibility = 'public' and a.review_status = 'approved'
        ), '[]'::jsonb),
        'variants', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', v.id,
            'sku', v.sku,
            'packDescription', v.pack_description,
            'saleUnit', v.sale_unit,
            'packNetWeightKg', v.pack_net_weight_kg::text,
            'minOrderQty', v.min_order_qty::text,
            'orderStepQty', v.order_step_qty::text,
            'offer', (
              select jsonb_build_object(
                'priceMode', o.price_mode,
                'currency', o.currency,
                'unitPriceMinor', o.unit_price_minor::text,
                'validTo', o.valid_to
              )
              from public.offers o
              where o.tenant_id = v.tenant_id and o.variant_id = v.id
                and o.valid_from <= now() and (o.valid_to is null or o.valid_to > now())
              order by o.valid_from desc
              limit 1
            )
          ) order by v.position, v.created_at)
          from public.variants v
          where v.tenant_id = p.tenant_id and v.product_id = p.id
        ), '[]'::jsonb),
        'evidence', coalesce((
          select jsonb_agg(jsonb_build_object(
            'field', e.field, 'value', e.value, 'sourceType', e.source_type, 'sourceUrl', e.source_url,
            'confirmedAt', e.confirmed_at
          ) order by e.confirmed_at)
          from public.product_evidence e
          where e.tenant_id = p.tenant_id and e.product_id = p.id and e.is_public
        ), '[]'::jsonb)
      ) order by p.name)
      from public.products p
      where p.tenant_id = p_tenant and p.status = 'approved'
    ), '[]'::jsonb)
  );
$$;
revoke all on function private.build_catalog_snapshot(uuid) from public;

-- ---------------------------------------------------------------------------
-- Commands (security definer: they write columns clients cannot write directly; each checks the caller's role)
-- ---------------------------------------------------------------------------

create function public.create_storefront(p_tenant uuid, p_slug text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not private.can_edit_catalog(p_tenant) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.storefronts (tenant_id, slug, name) values (p_tenant, p_slug, p_name) returning id into v_id;
  insert into public.storefront_versions (tenant_id, storefront_id, kind, created_by)
    values (p_tenant, v_id, 'draft', (select auth.uid()));
  perform private.audit(p_tenant, 'storefront.created', 'storefront', v_id, jsonb_build_object('slug', p_slug));
  return v_id;
end;
$$;

create function public.publish_storefront(p_storefront uuid, p_expected_revision integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.storefronts%rowtype;
  d public.storefront_versions%rowtype;
  v_id uuid;
  v_no integer;
begin
  select * into s from public.storefronts where id = p_storefront for update;
  if not found or not private.can_edit_catalog(s.tenant_id) then
    -- Same error for "missing" and "not yours" so ids of other tenants cannot be probed.
    raise exception 'storefront not found' using errcode = 'P0002';
  end if;

  select * into d from public.storefront_versions
    where storefront_id = s.id and kind = 'draft' for update;
  if d.revision <> p_expected_revision then
    raise exception 'version_conflict: draft is at revision %, expected %', d.revision, p_expected_revision
      using errcode = 'P0001', hint = 'reload the draft and review changes before publishing';
  end if;

  select coalesce(max(version_no), 0) + 1 into v_no from public.storefront_versions where storefront_id = s.id;

  insert into public.storefront_versions (
    tenant_id, storefront_id, kind, version_no, revision, schema_version, theme, brand, sections, catalog,
    created_by, published_by, published_at
  ) values (
    s.tenant_id, s.id, 'published', v_no, d.revision, d.schema_version, d.theme, d.brand, d.sections,
    private.build_catalog_snapshot(s.tenant_id), (select auth.uid()), (select auth.uid()), now()
  ) returning id into v_id;

  update public.storefronts set published_version_id = v_id, status = 'live' where id = s.id;
  perform private.audit(s.tenant_id, 'storefront.published', 'storefront', s.id,
    jsonb_build_object('version_id', v_id, 'version_no', v_no, 'draft_revision', d.revision));
  return v_id;
end;
$$;

create function public.rollback_storefront(p_storefront uuid, p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.storefronts%rowtype;
begin
  select * into s from public.storefronts where id = p_storefront for update;
  if not found or not private.can_edit_catalog(s.tenant_id) then
    raise exception 'storefront not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.storefront_versions
    where id = p_version and storefront_id = s.id and kind = 'published'
  ) then
    raise exception 'version not found' using errcode = 'P0002';
  end if;
  update public.storefronts set published_version_id = p_version, status = 'live' where id = s.id;
  perform private.audit(s.tenant_id, 'storefront.rolled_back', 'storefront', s.id, jsonb_build_object('version_id', p_version));
end;
$$;

revoke all on function public.create_storefront(uuid, text, text), public.publish_storefront(uuid, integer),
  public.rollback_storefront(uuid, uuid) from public;
grant execute on function public.create_storefront(uuid, text, text), public.publish_storefront(uuid, integer),
  public.rollback_storefront(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------

alter table public.storefronts enable row level security;
alter table public.storefront_versions enable row level security;
revoke all on public.storefronts, public.storefront_versions from anon, authenticated;

grant select on public.storefronts to anon, authenticated;
grant update (name) on public.storefronts to authenticated;
create policy storefronts_public_select on public.storefronts for select to anon, authenticated
  using (status = 'live' and published_version_id is not null);
create policy storefronts_member_select on public.storefronts for select to authenticated
  using ((select private.is_tenant_member(tenant_id)));
create policy storefronts_update on public.storefronts for update to authenticated
  using ((select private.can_edit_catalog(tenant_id)))
  with check ((select private.can_edit_catalog(tenant_id)));

grant select on public.storefront_versions to anon, authenticated;
grant update (theme, brand, sections) on public.storefront_versions to authenticated;
-- Visitors can read only the version currently pointed to by a live storefront.
create policy storefront_versions_public_select on public.storefront_versions for select to anon, authenticated
  using (
    kind = 'published'
    and exists (
      select 1 from public.storefronts s
      where s.published_version_id = storefront_versions.id and s.status = 'live'
    )
  );
create policy storefront_versions_member_select on public.storefront_versions for select to authenticated
  using ((select private.is_tenant_member(tenant_id)));
create policy storefront_versions_draft_update on public.storefront_versions for update to authenticated
  using (kind = 'draft' and (select private.can_edit_catalog(tenant_id)))
  with check (kind = 'draft' and (select private.can_edit_catalog(tenant_id)));
