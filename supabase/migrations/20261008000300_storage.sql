-- Storage buckets and object policies.
--
-- tenant-private: original uploads, evidence documents, unreviewed images. Path: <tenant_id>/<...>.
--   Members of the tenant can read; owner/editor can upload and delete. Anonymous users have no access.
-- tenant-public: approved images served on storefronts. Readable by anyone through public URLs. Clients cannot
--   write here: the server copies an asset in after review, using the service role and an explicit tenant check.
--
-- The tenant folder organizes files; authorization comes from the membership check, never from the path alone.

insert into storage.buckets (id, name, public)
values ('tenant-private', 'tenant-private', false), ('tenant-public', 'tenant-public', true)
on conflict (id) do nothing;

create policy tenant_private_select on storage.objects for select to authenticated
  using (
    bucket_id = 'tenant-private'
    and (select private.is_tenant_member(private.try_uuid((storage.foldername(name))[1])))
  );

create policy tenant_private_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tenant-private'
    and (select private.can_edit_catalog(private.try_uuid((storage.foldername(name))[1])))
  );

create policy tenant_private_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'tenant-private'
    and (select private.can_edit_catalog(private.try_uuid((storage.foldername(name))[1])))
  );
