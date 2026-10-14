-- Supabase's default privileges grant EXECUTE on every new function in `public` directly to anon and authenticated
-- (not via PUBLIC), so the earlier `revoke ... from public` did not remove them. Command functions already reject
-- callers without the right membership, but anonymous visitors should not be able to call them at all.

revoke execute on function
  public.create_tenant(text),
  public.approve_product(uuid),
  public.create_storefront(uuid, text, text),
  public.publish_storefront(uuid, integer),
  public.rollback_storefront(uuid, uuid)
from anon;

-- Trigger and helper functions in `private` are not covered by those defaults, but make the intent explicit.
revoke all on all functions in schema private from anon;
grant execute on function private.has_tenant_role(uuid, public.membership_role[]), private.is_tenant_member(uuid),
  private.can_edit_catalog(uuid), private.can_manage_members(uuid), private.try_uuid(text) to anon;
