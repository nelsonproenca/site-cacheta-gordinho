-- Fix for 20260801000035: verified directly against the linked project
-- (information_schema.column_privileges) that `revoke select (auth_phone)
-- on players from anon, authenticated` was a no-op. Reason: Postgres column
-- ACLs are only consulted when a column has an *explicit* column-level grant
-- (pg_attribute.attacl not null) — when a column's attacl is null (the
-- default), access falls back to the table-level ACL. Since Supabase already
-- grants table-wide SELECT on every public table to anon/authenticated by
-- default, `revoke select (col) ...` had nothing explicit to revoke and left
-- the table-level grant (and therefore the column) fully readable.
--
-- The only way to actually restrict a single column when a table-level grant
-- already exists is to revoke the table-level privilege and re-grant it back
-- explicitly enumerating every column except the sensitive one.
revoke select on public.players from anon, authenticated;

grant select (
  id,
  display_name,
  tiktok_handle,
  whatsapp,
  verified_via_tiktok,
  auth_user_id,
  created_at
) on public.players to anon, authenticated;
