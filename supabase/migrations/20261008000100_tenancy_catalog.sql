-- Foundation: tenants, memberships, assets, catalog (products, variants, offers, evidence) and audit.
--
-- Isolation rules applied throughout:
--   * every tenant-owned row carries tenant_id;
--   * child rows reference (tenant_id, parent_id) so a row can never point at another tenant's parent;
--   * tenant_id is immutable after insert;
--   * RLS is enabled on every table in the exposed schema and grants are explicit per role.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.membership_role as enum ('owner', 'editor', 'sales', 'viewer');
create type public.tenant_status as enum ('active', 'suspended');
create type public.product_status as enum ('draft', 'approved', 'archived');
create type public.price_mode as enum ('fixed', 'quote_required');
create type public.asset_kind as enum ('product_image', 'evidence', 'logo', 'story_image');
create type public.asset_visibility as enum ('private', 'public');
create type public.review_status as enum ('pending', 'approved', 'rejected');
create type public.sale_unit as enum ('kg', 'bag', 'box', 'carton', 'piece');
create type public.evidence_source as enum ('seller_statement', 'document', 'link');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create function private.prevent_tenant_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Malformed storage paths must evaluate to "no access", not raise.
create function private.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  status public.tenant_status not null default 'active',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.membership_role not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- Security definer so policies on other tables can consult memberships without recursing into its RLS.
create function private.has_tenant_role(p_tenant uuid, p_roles public.membership_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id
    where m.tenant_id = p_tenant
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
      and t.status = 'active'
  );
$$;

create function private.is_tenant_member(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_tenant_role(p_tenant, enum_range(null::public.membership_role));
$$;

-- Role groups used by policies. Kept as functions so the mapping is defined (and tested) in one place.
create function private.can_edit_catalog(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_tenant_role(p_tenant, array['owner', 'editor']::public.membership_role[]);
$$;

create function private.can_manage_members(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_tenant_role(p_tenant, array['owner']::public.membership_role[]);
$$;

revoke all on all functions in schema private from public;
grant execute on function
  private.has_tenant_role(uuid, public.membership_role[]),
  private.is_tenant_member(uuid),
  private.can_edit_catalog(uuid),
  private.can_manage_members(uuid),
  private.try_uuid(text)
to authenticated, anon;

-- A tenant must always keep at least one owner.
create function private.keep_last_owner() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_tenant uuid := old.tenant_id;
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.tenants where id = v_tenant)
     and not exists (
       select 1 from public.memberships
       where tenant_id = v_tenant and role = 'owner' and user_id <> old.user_id
     ) then
    raise exception 'a tenant must keep at least one owner' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_keep_last_owner
  before update or delete on public.memberships
  for each row execute function private.keep_last_owner();
create trigger memberships_tenant_immutable
  before update on public.memberships
  for each row execute function private.prevent_tenant_change();
create trigger tenants_touch before update on public.tenants
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create table public.audit_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  object_type text not null,
  object_id uuid,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_events_tenant_idx on public.audit_events (tenant_id, created_at desc);

create function private.audit(p_tenant uuid, p_action text, p_object_type text, p_object_id uuid, p_data jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_events (tenant_id, actor_user_id, action, object_type, object_id, data)
  values (p_tenant, (select auth.uid()), p_action, p_object_type, p_object_id, coalesce(p_data, '{}'::jsonb));
$$;
revoke all on function private.audit(uuid, text, text, uuid, jsonb) from public;

create function private.audit_membership_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.audit(
    coalesce(new.tenant_id, old.tenant_id),
    'membership.' || lower(tg_op),
    'membership',
    coalesce(new.user_id, old.user_id),
    jsonb_build_object('old_role', old.role, 'new_role', new.role)
  );
  return coalesce(new, old);
end;
$$;
create trigger memberships_audit
  after insert or update or delete on public.memberships
  for each row execute function private.audit_membership_change();

-- Onboarding: the caller becomes the owner of a new tenant.
create function public.create_tenant(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  insert into public.tenants (name) values (p_name) returning id into v_id;
  insert into public.memberships (tenant_id, user_id, role) values (v_id, v_user, 'owner');
  return v_id;
end;
$$;
revoke all on function public.create_tenant(text) from public;
grant execute on function public.create_tenant(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Assets (files live in Supabase Storage; this is the metadata + authorization record)
-- ---------------------------------------------------------------------------

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind public.asset_kind not null,
  bucket text not null check (bucket in ('tenant-private', 'tenant-public')),
  object_key text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 20 * 1024 * 1024),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  width integer check (width > 0),
  height integer check (height > 0),
  alt_text text check (length(alt_text) <= 300),
  visibility public.asset_visibility not null default 'private',
  review_status public.review_status not null default 'pending',
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (bucket, object_key),
  -- Objects are always stored under the owning tenant's folder.
  check (object_key like tenant_id::text || '/%'),
  -- Only approved assets may be public, and public assets live in the public bucket.
  check (visibility = 'private' or (review_status = 'approved' and bucket = 'tenant-public')),
  check (visibility = 'public' or bucket = 'tenant-private')
);
create index assets_tenant_idx on public.assets (tenant_id, kind, review_status);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120),
  name text not null check (length(btrim(name)) between 1 and 200),
  category text check (category ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  processing text check (length(processing) <= 200),
  summary text check (length(summary) <= 300),
  description text check (length(description) <= 5000),
  -- Declared origin; null means "not confirmed yet", never "Vietnam by default".
  origin_country char(2) check (origin_country ~ '^[A-Z]{2}$'),
  origin_region text check (length(origin_region) <= 120),
  storage_instructions text check (length(storage_instructions) <= 1000),
  shelf_life_note text check (length(shelf_life_note) <= 300),
  status public.product_status not null default 'draft',
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, slug),
  check ((status = 'approved') = (approved_at is not null))
);
create index products_tenant_status_idx on public.products (tenant_id, status);

create table public.product_assets (
  tenant_id uuid not null,
  product_id uuid not null,
  asset_id uuid not null,
  position smallint not null default 0 check (position >= 0),
  primary key (product_id, asset_id),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade,
  foreign key (tenant_id, asset_id) references public.assets (tenant_id, id) on delete cascade
);
create index product_assets_tenant_idx on public.product_assets (tenant_id, product_id, position);

create table public.variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid not null,
  sku text check (sku ~ '^[A-Za-z0-9._-]{1,64}$'),
  pack_description text check (length(pack_description) <= 200),
  sale_unit public.sale_unit not null,
  -- Net weight of one sale unit, only when the seller confirmed it. Never derived from a photo.
  pack_net_weight_kg numeric(12, 3) check (pack_net_weight_kg > 0),
  -- MOQ and step are expressed in sale_unit. 1.5 kg stays 1.5 kg; it is never coerced into bags.
  min_order_qty numeric(14, 3) not null check (min_order_qty > 0),
  order_step_qty numeric(14, 3) not null check (order_step_qty > 0),
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade,
  check (sale_unit <> 'kg' or pack_net_weight_kg is null)
);
create unique index variants_tenant_sku_uniq on public.variants (tenant_id, sku) where sku is not null;
create index variants_product_idx on public.variants (tenant_id, product_id, position);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  variant_id uuid not null,
  price_mode public.price_mode not null,
  currency char(3) not null default 'VND' check (currency ~ '^[A-Z]{3}$'),
  -- Integer minor units (đồng for VND). Never float, never 0 as a stand-in for "contact us".
  unit_price_minor bigint,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, variant_id) references public.variants (tenant_id, id) on delete cascade,
  check (
    (price_mode = 'fixed' and unit_price_minor is not null and unit_price_minor > 0)
    or (price_mode = 'quote_required' and unit_price_minor is null)
  ),
  check (valid_to is null or valid_to > valid_from)
);
create index offers_variant_idx on public.offers (tenant_id, variant_id, valid_from desc);

create table public.product_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid not null,
  variant_id uuid,
  field text not null check (field ~ '^[a-z_]{1,64}$'),
  value text not null check (length(value) <= 1000),
  source_type public.evidence_source not null,
  asset_id uuid,
  source_url text check (source_url ~ '^https://'),
  is_public boolean not null default false,
  confirmed_by uuid not null,
  confirmed_at timestamptz not null default now(),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade,
  foreign key (tenant_id, variant_id) references public.variants (tenant_id, id) on delete cascade,
  foreign key (tenant_id, asset_id) references public.assets (tenant_id, id) on delete restrict,
  check (source_type <> 'document' or asset_id is not null),
  check (source_type <> 'link' or source_url is not null)
);
create index product_evidence_product_idx on public.product_evidence (tenant_id, product_id);

-- Triggers: tenant immutability + updated_at
do $$
declare
  t text;
begin
  foreach t in array array['assets', 'products', 'product_assets', 'variants', 'offers', 'product_evidence', 'audit_events']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.prevent_tenant_change()', t || '_tenant_immutable', t);
  end loop;
  foreach t in array array['assets', 'products', 'variants']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()', t || '_touch', t);
  end loop;
end;
$$;

-- Approval gate: a product can only be approved once the facts a buyer needs are confirmed.
-- Returns the list of missing items (empty array when approved).
-- Security definer because approval columns are not writable by clients; the role check below is mandatory.
create function public.approve_product(p_product uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  p public.products%rowtype;
  v_missing text[] := '{}';
begin
  select * into p from public.products where id = p_product for update;
  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  if not private.can_edit_catalog(p.tenant_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p.origin_country is null then v_missing := array_append(v_missing, 'origin_country'); end if;
  if p.processing is null then v_missing := array_append(v_missing, 'processing'); end if;
  if p.storage_instructions is null then v_missing := array_append(v_missing, 'storage_instructions'); end if;
  if not exists (select 1 from public.variants v where v.tenant_id = p.tenant_id and v.product_id = p.id) then
    v_missing := array_append(v_missing, 'variant');
  elsif exists (
    select 1 from public.variants v
    where v.tenant_id = p.tenant_id and v.product_id = p.id
      and not exists (
        select 1 from public.offers o
        where o.tenant_id = v.tenant_id and o.variant_id = v.id
          and o.valid_from <= now() and (o.valid_to is null or o.valid_to > now())
      )
  ) then
    v_missing := array_append(v_missing, 'offer');
  end if;

  if cardinality(v_missing) = 0 then
    update public.products
      set status = 'approved', approved_by = (select auth.uid()), approved_at = now()
      where id = p.id;
    perform private.audit(p.tenant_id, 'product.approved', 'product', p.id);
  end if;
  return v_missing;
end;
$$;
revoke all on function public.approve_product(uuid) from public;
grant execute on function public.approve_product(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_events enable row level security;
alter table public.assets enable row level security;
alter table public.products enable row level security;
alter table public.product_assets enable row level security;
alter table public.variants enable row level security;
alter table public.offers enable row level security;
alter table public.product_evidence enable row level security;

revoke all on public.tenants, public.memberships, public.audit_events, public.assets, public.products,
  public.product_assets, public.variants, public.offers, public.product_evidence
  from anon, authenticated;

-- Anonymous visitors never read catalog tables directly: public pages read the published storefront snapshot.

grant select on public.tenants to authenticated;
grant update (name) on public.tenants to authenticated;
create policy tenants_select on public.tenants for select to authenticated
  using ((select private.is_tenant_member(id)));
create policy tenants_update on public.tenants for update to authenticated
  using ((select private.can_manage_members(id)))
  with check ((select private.can_manage_members(id)));

grant select, insert, delete on public.memberships to authenticated;
grant update (role) on public.memberships to authenticated;
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select private.can_manage_members(tenant_id)));
create policy memberships_insert on public.memberships for insert to authenticated
  with check ((select private.can_manage_members(tenant_id)));
create policy memberships_update on public.memberships for update to authenticated
  using ((select private.can_manage_members(tenant_id)))
  with check ((select private.can_manage_members(tenant_id)));
create policy memberships_delete on public.memberships for delete to authenticated
  using ((select private.can_manage_members(tenant_id)));

grant select on public.audit_events to authenticated;
create policy audit_select on public.audit_events for select to authenticated
  using ((select private.can_edit_catalog(tenant_id)));

grant select, insert, delete on public.assets to authenticated;
grant update (alt_text, review_status) on public.assets to authenticated;
create policy assets_select on public.assets for select to authenticated
  using ((select private.is_tenant_member(tenant_id)));
create policy assets_insert on public.assets for insert to authenticated
  with check (
    (select private.can_edit_catalog(tenant_id))
    and bucket = 'tenant-private' and visibility = 'private' and review_status = 'pending'
    and uploaded_by = (select auth.uid())
  );
create policy assets_update on public.assets for update to authenticated
  using ((select private.can_edit_catalog(tenant_id)))
  with check ((select private.can_edit_catalog(tenant_id)));
create policy assets_delete on public.assets for delete to authenticated
  using ((select private.can_edit_catalog(tenant_id)));

-- Catalog tables share one policy shape: members read, owner/editor write.
grant select, insert, update, delete on public.products, public.product_assets, public.variants,
  public.offers, public.product_evidence to authenticated;
-- Approval only happens through approve_product().
revoke update on public.products from authenticated;
grant update (slug, name, category, processing, summary, description, origin_country, origin_region,
  storage_instructions, shelf_life_note) on public.products to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['products', 'product_assets', 'variants', 'offers', 'product_evidence']
  loop
    execute format('create policy %I on public.%I for select to authenticated using ((select private.is_tenant_member(tenant_id)))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.can_edit_catalog(tenant_id)))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.can_edit_catalog(tenant_id))) with check ((select private.can_edit_catalog(tenant_id)))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.can_edit_catalog(tenant_id)))', t || '_delete', t);
  end loop;
end;
$$;

-- New products always start as drafts.
create policy products_insert_draft on public.products as restrictive for insert to authenticated
  with check (status = 'draft' and approved_at is null);

-- Changing what a buyer sees on an approved product sends it back to review.
create function private.reset_approval_on_edit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'approved' and new.status = 'approved' and (
       new.name, new.slug, new.category, new.processing, new.summary, new.description, new.origin_country,
       new.origin_region, new.storage_instructions, new.shelf_life_note
     ) is distinct from (
       old.name, old.slug, old.category, old.processing, old.summary, old.description, old.origin_country,
       old.origin_region, old.storage_instructions, old.shelf_life_note
     ) then
    new.status := 'draft';
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end;
$$;
create trigger products_reset_approval before update on public.products
  for each row execute function private.reset_approval_on_edit();

-- Variant/offer changes also require re-approval of the parent product.
create function private.reset_parent_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := coalesce(new.tenant_id, old.tenant_id);
  v_product uuid;
begin
  if tg_table_name = 'variants' then
    v_product := coalesce(new.product_id, old.product_id);
  else
    select v.product_id into v_product from public.variants v
    where v.tenant_id = v_tenant and v.id = coalesce(new.variant_id, old.variant_id);
  end if;
  update public.products
    set status = 'draft', approved_at = null, approved_by = null
    where tenant_id = v_tenant and id = v_product and status = 'approved';
  return coalesce(new, old);
end;
$$;
create trigger variants_reset_approval after insert or update or delete on public.variants
  for each row execute function private.reset_parent_approval();
create trigger offers_reset_approval after insert or update or delete on public.offers
  for each row execute function private.reset_parent_approval();
