-- Wholesale flow: buyer request for quote (RFQ) → seller quote versions → buyer acceptance → order snapshot.
--
-- Buyers are anonymous. They act only through security definer functions:
--   submit_rfq(slug, payload)        items must be in the storefront's currently PUBLISHED catalog snapshot
--   get_rfq_for_buyer(token)         read their request and the latest sent quote
--   accept_quote(token, quote, key)  idempotent, one order per RFQ, expired/superseded quotes refused
-- The buyer link carries a random token; only its sha256 is stored. Sellers (owner/editor/sales) read and quote
-- through RLS. Money is bigint minor units (VND has no minor unit, so 1 = 1 đồng); quantities are numeric(14,3).

create function private.can_sell(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_tenant_role(p_tenant, array['owner', 'editor', 'sales']::public.membership_role[]);
$$;
revoke all on function private.can_sell(uuid) from public, anon;
grant execute on function private.can_sell(uuid) to authenticated;

create type public.rfq_status as enum ('submitted', 'quoted', 'accepted', 'declined', 'cancelled');
create type public.quote_status as enum ('draft', 'sent', 'accepted', 'superseded', 'withdrawn');
create type public.buyer_type as enum ('restaurant', 'kitchen', 'retailer', 'distributor', 'factory', 'household', 'other');

create table public.rfqs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  storefront_id uuid not null,
  -- Snapshot version the buyer saw when submitting.
  storefront_version_id uuid not null,
  reference text not null check (reference ~ '^YC-[0-9A-Z]{8}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status public.rfq_status not null default 'submitted',
  buyer_name text not null check (length(btrim(buyer_name)) between 2 and 120),
  buyer_phone text not null check (buyer_phone ~ '^\+?[0-9 .-]{8,20}$'),
  buyer_email text check (buyer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(buyer_email) <= 200),
  buyer_type public.buyer_type not null default 'other',
  company_name text check (length(company_name) <= 200),
  delivery_area text not null check (length(btrim(delivery_area)) between 2 and 300),
  needed_by date,
  frequency text check (length(frequency) <= 120),
  need_vat_invoice boolean not null default false,
  note text check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  foreign key (tenant_id, storefront_id) references public.storefronts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, storefront_version_id) references public.storefront_versions (tenant_id, id)
);
create index rfqs_tenant_idx on public.rfqs (tenant_id, created_at desc);

create table public.rfq_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  rfq_id uuid not null,
  position smallint not null check (position between 0 and 29),
  -- Ids and labels copied from the published snapshot; the catalog row may change or disappear later.
  product_id uuid not null,
  variant_id uuid,
  product_name text not null check (length(product_name) between 1 and 200),
  pack_label text check (length(pack_label) <= 200),
  sale_unit public.sale_unit not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  unique (tenant_id, id),
  unique (rfq_id, position),
  foreign key (tenant_id, rfq_id) references public.rfqs (tenant_id, id) on delete cascade
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  rfq_id uuid not null,
  version integer not null check (version > 0),
  status public.quote_status not null default 'draft',
  currency char(3) not null default 'VND' check (currency = 'VND'),
  valid_until timestamptz,
  delivery_fee_minor bigint check (delivery_fee_minor >= 0),
  delivery_note text check (length(delivery_note) <= 500),
  payment_terms text check (length(payment_terms) <= 500),
  note text check (length(note) <= 1000),
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (tenant_id, id),
  unique (rfq_id, version),
  foreign key (tenant_id, rfq_id) references public.rfqs (tenant_id, id) on delete cascade,
  check (status = 'draft' or (sent_at is not null and valid_until is not null and valid_until > sent_at))
);
-- At most one live (sent) quote per RFQ.
create unique index quotes_one_sent on public.quotes (rfq_id) where status = 'sent';

create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  quote_id uuid not null,
  position smallint not null check (position between 0 and 49),
  rfq_item_id uuid,
  description text not null check (length(btrim(description)) between 1 and 300),
  sale_unit public.sale_unit not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor > 0),
  -- Rounded to whole đồng.
  line_total_minor bigint not null check (line_total_minor = round(quantity * unit_price_minor)),
  unique (quote_id, position),
  foreign key (tenant_id, quote_id) references public.quotes (tenant_id, id) on delete cascade,
  foreign key (tenant_id, rfq_item_id) references public.rfq_items (tenant_id, id) on delete set null (rfq_item_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  rfq_id uuid not null unique,
  quote_id uuid not null unique,
  reference text not null check (reference ~ '^DH-[0-9A-Z]{8}$'),
  idempotency_key text not null check (length(idempotency_key) between 8 and 80),
  -- Everything the buyer agreed to, frozen at acceptance: buyer, lines, prices, fees, terms.
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  total_minor bigint not null check (total_minor >= 0),
  status text not null default 'confirmed' check (status in ('confirmed', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, reference),
  foreign key (tenant_id, rfq_id) references public.rfqs (tenant_id, id) on delete cascade,
  foreign key (tenant_id, quote_id) references public.quotes (tenant_id, id)
);

do $$
declare
  t text;
begin
  foreach t in array array['rfqs', 'rfq_items', 'quotes', 'quote_lines', 'orders'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.prevent_tenant_change()', t || '_tenant_immutable', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.can_sell(tenant_id)))', t || '_select', t);
  end loop;
end;
$$;
create trigger rfqs_touch before update on public.rfqs for each row execute function private.touch_updated_at();

-- Sent quotes and their lines are immutable; a change means a new version.
create function private.quote_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'quote_lines' then
    if exists (select 1 from public.quotes q where q.id = coalesce(new.quote_id, old.quote_id) and q.status <> 'draft') then
      raise exception 'quote lines are locked once the quote is sent' using errcode = '42501';
    end if;
    return coalesce(new, old);
  end if;
  if old.status <> 'draft' and (
    new.valid_until, new.delivery_fee_minor, new.delivery_note, new.payment_terms, new.note, new.subtotal_minor, new.total_minor
  ) is distinct from (
    old.valid_until, old.delivery_fee_minor, old.delivery_note, old.payment_terms, old.note, old.subtotal_minor, old.total_minor
  ) then
    raise exception 'a sent quote cannot be edited; create a new version' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger quotes_guard before update on public.quotes for each row execute function private.quote_guard();
-- Not on delete: cascades from a deleted request or tenant must still work (clients cannot delete anyway).
create trigger quote_lines_guard before insert or update on public.quote_lines
  for each row execute function private.quote_guard();

create function private.random_ref(p_prefix text) returns text
language sql volatile set search_path = '' as $$
  select p_prefix || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

-- ---------------------------------------------------------------------------------------------- buyer: submit

create function public.submit_rfq(p_storefront_slug text, p_request jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.storefronts%rowtype;
  v_catalog jsonb;
  v_id uuid;
  -- 2 × 122 random bits from gen_random_uuid (no extension needed).
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_ref text;
  v_item jsonb;
  v_prod jsonb;
  v_var jsonb;
  v_pos integer := 0;
  v_qty numeric;
begin
  select * into s from public.storefronts where slug = p_storefront_slug and status = 'live';
  if not found then
    raise exception 'storefront not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.tenants t where t.id = s.tenant_id and t.status = 'active') then
    raise exception 'storefront not found' using errcode = 'P0002';
  end if;
  select catalog into v_catalog from public.storefront_versions where id = s.published_version_id;

  if jsonb_typeof(p_request -> 'items') <> 'array' or jsonb_array_length(p_request -> 'items') not between 1 and 30 then
    raise exception 'between 1 and 30 items are required' using errcode = '22023';
  end if;

  loop
    v_ref := private.random_ref('YC');
    exit when v_ref ~ '^YC-[0-9A-Z]{8}$' and not exists (select 1 from public.rfqs where tenant_id = s.tenant_id and reference = v_ref);
  end loop;

  insert into public.rfqs (tenant_id, storefront_id, storefront_version_id, reference, token_hash, buyer_name, buyer_phone,
    buyer_email, buyer_type, company_name, delivery_area, needed_by, frequency, need_vat_invoice, note)
  values (s.tenant_id, s.id, s.published_version_id, v_ref, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    btrim(p_request ->> 'buyerName'), btrim(p_request ->> 'buyerPhone'), nullif(btrim(p_request ->> 'buyerEmail'), ''),
    coalesce((p_request ->> 'buyerType')::public.buyer_type, 'other'), nullif(btrim(p_request ->> 'companyName'), ''),
    btrim(p_request ->> 'deliveryArea'), (p_request ->> 'neededBy')::date, nullif(btrim(p_request ->> 'frequency'), ''),
    coalesce((p_request ->> 'needVatInvoice')::boolean, false), nullif(btrim(p_request ->> 'note'), ''))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_request -> 'items') loop
    -- Only products and variants of the published snapshot can be requested.
    select p into v_prod from jsonb_array_elements(v_catalog -> 'products') p where p ->> 'id' = v_item ->> 'productId';
    if v_prod is null then
      raise exception 'product is not on this storefront' using errcode = '22023';
    end if;
    v_var := null;
    if v_item ->> 'variantId' is not null then
      select v into v_var from jsonb_array_elements(v_prod -> 'variants') v where v ->> 'id' = v_item ->> 'variantId';
      if v_var is null then
        raise exception 'variant is not on this storefront' using errcode = '22023';
      end if;
    else
      v_var := v_prod -> 'variants' -> 0;
    end if;
    v_qty := (v_item ->> 'quantity')::numeric;
    insert into public.rfq_items (tenant_id, rfq_id, position, product_id, variant_id, product_name, pack_label, sale_unit, quantity)
    values (s.tenant_id, v_id, v_pos, (v_prod ->> 'id')::uuid, (v_var ->> 'id')::uuid, v_prod ->> 'name',
      v_var ->> 'packDescription', coalesce(v_var ->> 'saleUnit', 'kg')::public.sale_unit, v_qty);
    v_pos := v_pos + 1;
  end loop;

  perform private.audit(s.tenant_id, 'rfq.submitted', 'rfq', v_id, jsonb_build_object('reference', v_ref, 'items', v_pos));
  return jsonb_build_object('rfqId', v_id, 'reference', v_ref, 'token', v_token);
end;
$$;

-- ---------------------------------------------------------------------------------------------- buyer: read

create function public.get_rfq_for_buyer(p_token text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'reference', r.reference,
    'status', r.status,
    'storefrontSlug', s.slug,
    'storefrontName', s.name,
    'createdAt', r.created_at,
    'buyerName', r.buyer_name,
    'deliveryArea', r.delivery_area,
    'neededBy', r.needed_by,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('productName', i.product_name, 'packLabel', i.pack_label,
                'saleUnit', i.sale_unit, 'quantity', i.quantity::text) order by i.position), '[]'::jsonb)
              from public.rfq_items i where i.rfq_id = r.id),
    'quote', (select jsonb_build_object('id', q.id, 'version', q.version, 'status', q.status, 'validUntil', q.valid_until,
                'expired', q.status = 'sent' and q.valid_until <= now(),
                'deliveryFeeMinor', q.delivery_fee_minor::text, 'deliveryNote', q.delivery_note, 'paymentTerms', q.payment_terms,
                'note', q.note, 'subtotalMinor', q.subtotal_minor::text, 'totalMinor', q.total_minor::text, 'sentAt', q.sent_at,
                'lines', (select coalesce(jsonb_agg(jsonb_build_object('description', l.description, 'saleUnit', l.sale_unit,
                            'quantity', l.quantity::text, 'unitPriceMinor', l.unit_price_minor::text,
                            'lineTotalMinor', l.line_total_minor::text) order by l.position), '[]'::jsonb)
                          from public.quote_lines l where l.quote_id = q.id))
              from public.quotes q where q.rfq_id = r.id and q.status in ('sent', 'accepted')
              order by q.version desc limit 1),
    'order', (select jsonb_build_object('reference', o.reference, 'totalMinor', o.total_minor::text, 'createdAt', o.created_at)
              from public.orders o where o.rfq_id = r.id)
  )
  from public.rfqs r join public.storefronts s on s.id = r.storefront_id
  where r.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- ---------------------------------------------------------------------------------------------- buyer: accept

create function public.accept_quote(p_token text, p_quote uuid, p_idempotency_key text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.rfqs%rowtype;
  q public.quotes%rowtype;
  o public.orders%rowtype;
  v_ref text;
  v_snapshot jsonb;
begin
  -- Lock the RFQ: concurrent accepts of the same request are serialized here.
  select * into r from public.rfqs where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  select * into o from public.orders where rfq_id = r.id;
  if found then
    if o.quote_id = p_quote then
      return jsonb_build_object('orderReference', o.reference, 'totalMinor', o.total_minor::text, 'replayed', true);
    end if;
    raise exception 'quote_unavailable: this request already has an order' using errcode = 'P0001';
  end if;

  select * into q from public.quotes where id = p_quote and rfq_id = r.id for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if q.status <> 'sent' then
    raise exception 'quote_unavailable: quote is %', q.status using errcode = 'P0001';
  end if;
  if q.valid_until <= now() then
    raise exception 'quote_unavailable: quote expired' using errcode = 'P0001';
  end if;

  loop
    v_ref := private.random_ref('DH');
    exit when v_ref ~ '^DH-[0-9A-Z]{8}$' and not exists (select 1 from public.orders where tenant_id = r.tenant_id and reference = v_ref);
  end loop;

  v_snapshot := jsonb_build_object(
    'schemaVersion', 'order-snapshot.v1',
    'rfqReference', r.reference,
    'quoteVersion', q.version,
    'currency', q.currency,
    'buyer', jsonb_build_object('name', r.buyer_name, 'phone', r.buyer_phone, 'email', r.buyer_email, 'type', r.buyer_type,
                                'company', r.company_name, 'deliveryArea', r.delivery_area, 'neededBy', r.needed_by,
                                'needVatInvoice', r.need_vat_invoice),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('description', l.description, 'saleUnit', l.sale_unit,
                'quantity', l.quantity::text, 'unitPriceMinor', l.unit_price_minor::text, 'lineTotalMinor', l.line_total_minor::text)
                order by l.position), '[]'::jsonb) from public.quote_lines l where l.quote_id = q.id),
    'subtotalMinor', q.subtotal_minor::text,
    'deliveryFeeMinor', q.delivery_fee_minor::text,
    'deliveryNote', q.delivery_note,
    'paymentTerms', q.payment_terms,
    'totalMinor', q.total_minor::text,
    'acceptedAt', now()
  );

  insert into public.orders (tenant_id, rfq_id, quote_id, reference, idempotency_key, snapshot, total_minor)
  values (r.tenant_id, r.id, q.id, v_ref, p_idempotency_key, v_snapshot, q.total_minor)
  returning * into o;
  update public.quotes set status = 'accepted' where id = q.id;
  update public.rfqs set status = 'accepted' where id = r.id;
  perform private.audit(r.tenant_id, 'order.created', 'order', o.id, jsonb_build_object('reference', v_ref, 'quote_version', q.version));
  return jsonb_build_object('orderReference', o.reference, 'totalMinor', o.total_minor::text, 'replayed', false);
end;
$$;

-- ---------------------------------------------------------------------------------------------- seller: quotes

-- Creates a new quote version from line items, sends it (valid for p_valid_days) and supersedes the previous one.
create function public.send_quote(p_rfq uuid, p_quote jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.rfqs%rowtype;
  v_id uuid;
  v_version integer;
  v_line jsonb;
  v_pos integer := 0;
  v_subtotal bigint := 0;
  v_fee bigint := nullif(p_quote ->> 'deliveryFeeMinor', '')::bigint;
  v_days integer := coalesce((p_quote ->> 'validDays')::integer, 3);
  v_qty numeric;
  v_price bigint;
  v_item uuid;
begin
  select * into r from public.rfqs where id = p_rfq for update;
  if not found or not private.can_sell(r.tenant_id) then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if r.status in ('accepted', 'declined', 'cancelled') then
    raise exception 'quote_unavailable: request is %', r.status using errcode = 'P0001';
  end if;
  if v_days not between 1 and 30 then
    raise exception 'quote validity must be 1–30 days' using errcode = '22023';
  end if;
  if jsonb_typeof(p_quote -> 'lines') <> 'array' or jsonb_array_length(p_quote -> 'lines') not between 1 and 50 then
    raise exception 'between 1 and 50 quote lines are required' using errcode = '22023';
  end if;

  update public.quotes set status = 'superseded' where rfq_id = r.id and status = 'sent';
  select coalesce(max(version), 0) + 1 into v_version from public.quotes where rfq_id = r.id;

  insert into public.quotes (tenant_id, rfq_id, version, status, delivery_fee_minor, delivery_note, payment_terms, note, created_by)
  values (r.tenant_id, r.id, v_version, 'draft', v_fee, nullif(btrim(p_quote ->> 'deliveryNote'), ''),
    nullif(btrim(p_quote ->> 'paymentTerms'), ''), nullif(btrim(p_quote ->> 'note'), ''), (select auth.uid()))
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_quote -> 'lines') loop
    v_qty := (v_line ->> 'quantity')::numeric;
    v_price := (v_line ->> 'unitPriceMinor')::bigint;
    v_item := (v_line ->> 'rfqItemId')::uuid;
    if v_item is not null and not exists (select 1 from public.rfq_items i where i.id = v_item and i.rfq_id = r.id) then
      raise exception 'line refers to another request' using errcode = '22023';
    end if;
    insert into public.quote_lines (tenant_id, quote_id, position, rfq_item_id, description, sale_unit, quantity,
      unit_price_minor, line_total_minor)
    values (r.tenant_id, v_id, v_pos, v_item, btrim(v_line ->> 'description'), (v_line ->> 'saleUnit')::public.sale_unit,
      v_qty, v_price, round(v_qty * v_price));
    v_subtotal := v_subtotal + round(v_qty * v_price);
    v_pos := v_pos + 1;
  end loop;

  update public.quotes
    set subtotal_minor = v_subtotal, total_minor = v_subtotal + coalesce(v_fee, 0),
        status = 'sent', sent_at = now(), valid_until = now() + make_interval(days => v_days)
    where id = v_id;
  update public.rfqs set status = 'quoted' where id = r.id;
  perform private.audit(r.tenant_id, 'quote.sent', 'quote', v_id, jsonb_build_object('version', v_version, 'total', v_subtotal + coalesce(v_fee, 0)));
  return v_id;
end;
$$;

create function public.set_rfq_status(p_rfq uuid, p_status public.rfq_status) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.rfqs%rowtype;
begin
  select * into r from public.rfqs where id = p_rfq for update;
  if not found or not private.can_sell(r.tenant_id) then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if p_status not in ('declined', 'cancelled') or r.status = 'accepted' then
    raise exception 'quote_unavailable: cannot change an accepted request' using errcode = 'P0001';
  end if;
  update public.quotes set status = 'withdrawn' where rfq_id = r.id and status = 'sent';
  update public.rfqs set status = p_status where id = r.id;
end;
$$;

revoke all on function public.submit_rfq(text, jsonb), public.get_rfq_for_buyer(text), public.accept_quote(text, uuid, text),
  public.send_quote(uuid, jsonb), public.set_rfq_status(uuid, public.rfq_status), private.quote_guard(), private.random_ref(text)
  from public, anon, authenticated;
grant execute on function public.submit_rfq(text, jsonb), public.get_rfq_for_buyer(text), public.accept_quote(text, uuid, text)
  to anon, authenticated;
grant execute on function public.send_quote(uuid, jsonb), public.set_rfq_status(uuid, public.rfq_status) to authenticated;
