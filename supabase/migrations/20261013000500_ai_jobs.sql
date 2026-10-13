-- AI jobs: photo analysis runs in the background with leases, retries and a dead-letter state.
--
-- Clients never write jobs directly. A seller enqueues through enqueue_product_analysis(), which derives the tenant
-- from the uploaded assets and checks the caller's role. The worker runs on the server with the owner connection
-- (bypasses RLS) and only touches the job it claimed; every write is fenced by the attempt number so a worker whose
-- lease expired cannot overwrite a newer result.

create type public.ai_job_status as enum ('queued', 'running', 'succeeded', 'dead');

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('analyze_product_images')),
  -- sha256 over the sorted input asset hashes + schema version: the same photos are analysed once.
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  schema_version text not null check (schema_version ~ '^[a-z0-9.-]{1,40}$'),
  seller_note text check (length(seller_note) <= 500),
  status public.ai_job_status not null default 'queued',
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  run_after timestamptz not null default now(),
  lease_until timestamptz,
  provider text check (length(provider) <= 40),
  model text check (length(model) <= 120),
  prompt_version text check (length(prompt_version) <= 40),
  output jsonb check (output is null or jsonb_typeof(output) = 'object'),
  usage jsonb check (usage is null or jsonb_typeof(usage) = 'object'),
  last_error text check (length(last_error) <= 500),
  product_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (tenant_id, id),
  unique (tenant_id, kind, input_hash, schema_version),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete set null (product_id),
  check ((status = 'succeeded') = (output is not null)),
  check (status <> 'running' or lease_until is not null)
);
create index ai_jobs_runnable_idx on public.ai_jobs (run_after) where status in ('queued', 'running');
create index ai_jobs_tenant_idx on public.ai_jobs (tenant_id, created_at desc);

create table public.ai_job_assets (
  tenant_id uuid not null,
  job_id uuid not null,
  asset_id uuid not null,
  position smallint not null check (position between 0 and 7),
  primary key (job_id, asset_id),
  unique (job_id, position),
  foreign key (tenant_id, job_id) references public.ai_jobs (tenant_id, id) on delete cascade,
  foreign key (tenant_id, asset_id) references public.assets (tenant_id, id) on delete cascade
);

create trigger ai_jobs_tenant_immutable before update on public.ai_jobs
  for each row execute function private.prevent_tenant_change();
create trigger ai_job_assets_tenant_immutable before update on public.ai_job_assets
  for each row execute function private.prevent_tenant_change();
create trigger ai_jobs_touch before update on public.ai_jobs
  for each row execute function private.touch_updated_at();

alter table public.ai_jobs enable row level security;
alter table public.ai_job_assets enable row level security;
revoke all on public.ai_jobs, public.ai_job_assets from anon, authenticated;
grant select on public.ai_jobs, public.ai_job_assets to authenticated;
create policy ai_jobs_select on public.ai_jobs for select to authenticated
  using ((select private.is_tenant_member(tenant_id)));
create policy ai_job_assets_select on public.ai_job_assets for select to authenticated
  using ((select private.is_tenant_member(tenant_id)));

-- Enqueue an analysis of 1–8 product photos. The tenant comes from the assets, never from the caller.
-- Idempotent: the same photos return the existing job. A dead job is queued again (controlled re-run).
create function public.enqueue_product_analysis(p_asset_ids uuid[], p_seller_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
  v_tenants integer;
  v_found integer;
  v_hash text;
  v_id uuid;
  v_schema constant text := 'product-draft.v1';
begin
  if p_asset_ids is null or cardinality(p_asset_ids) not between 1 and 8
     or cardinality(p_asset_ids) <> (select count(distinct x) from unnest(p_asset_ids) x) then
    raise exception 'between 1 and 8 distinct photos are required' using errcode = '22023';
  end if;

  select count(*), count(distinct a.tenant_id), min(a.tenant_id::text)::uuid
    into v_found, v_tenants, v_tenant
    from public.assets a
    where a.id = any (p_asset_ids) and a.kind = 'product_image';
  -- Same error for "missing", "not yours" and "mixed tenants" so asset ids of other tenants cannot be probed.
  if v_found <> cardinality(p_asset_ids) or v_tenants <> 1 or not private.can_edit_catalog(v_tenant) then
    raise exception 'assets not found' using errcode = 'P0002';
  end if;

  select encode(sha256(convert_to(string_agg(a.sha256, ',' order by a.sha256) || '|' || v_schema, 'UTF8')), 'hex')
    into v_hash
    from public.assets a where a.id = any (p_asset_ids);

  insert into public.ai_jobs (tenant_id, kind, input_hash, schema_version, seller_note, created_by)
  values (v_tenant, 'analyze_product_images', v_hash, v_schema, nullif(btrim(p_seller_note), ''), (select auth.uid()))
  on conflict (tenant_id, kind, input_hash, schema_version) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.ai_jobs
      where tenant_id = v_tenant and kind = 'analyze_product_images' and input_hash = v_hash and schema_version = v_schema;
    update public.ai_jobs
      set status = 'queued', attempts = 0, run_after = now(), lease_until = null, last_error = null
      where id = v_id and status = 'dead';
    return v_id;
  end if;

  insert into public.ai_job_assets (tenant_id, job_id, asset_id, position)
  select v_tenant, v_id, x.id, (x.ord - 1)::smallint
  from unnest(p_asset_ids) with ordinality as x (id, ord);

  perform private.audit(v_tenant, 'ai_job.enqueued', 'ai_job', v_id, jsonb_build_object('assets', cardinality(p_asset_ids)));
  return v_id;
end;
$$;

-- Record which product a seller created from a job's draft. Both must belong to the same tenant (composite FK).
create function public.link_ai_job_product(p_job uuid, p_product uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.ai_jobs where id = p_job for update;
  if not found or not private.can_edit_catalog(v_tenant) then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  update public.ai_jobs set product_id = p_product where id = p_job;
end;
$$;

revoke all on function public.enqueue_product_analysis(uuid[], text), public.link_ai_job_product(uuid, uuid)
  from public, anon;
grant execute on function public.enqueue_product_analysis(uuid[], text), public.link_ai_job_product(uuid, uuid)
  to authenticated;
