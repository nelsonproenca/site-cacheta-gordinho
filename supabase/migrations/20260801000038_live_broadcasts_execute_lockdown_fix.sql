-- Fix for 20260801000037: verified against the linked project
-- (information_schema.routine_privileges) that `anon` had EXECUTE on both
-- new functions despite `revoke all ... from public; grant ... to
-- authenticated`. Same root cause as 20260801000035/036 for table columns —
-- this project's default privileges grant access to `anon` automatically at
-- CREATE time, independent of the PUBLIC pseudo-role. `has_account_access`
-- and friends have the same anon grant (confirmed) but are harmless because
-- their body already checks auth.uid() internally; these two functions
-- weren't written that way originally, so they're fixed on both layers here
-- — explicit revoke from anon, AND an internal auth.uid() check, so a future
-- privilege change can't silently reopen this ("don't trust a single
-- layer", same reasoning as matches_validate_account / is_approved_admin
-- double-checks elsewhere in this schema).
create or replace function public.list_live_broadcasts_now()
returns table (
  id uuid,
  tiktok_account_id uuid,
  status text,
  title text,
  started_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select id, tiktok_account_id, status, title, started_at
  from public.live_broadcasts
  where status = 'live' and auth.uid() is not null
  order by started_at desc;
$$;

revoke all on function public.list_live_broadcasts_now() from public, anon;
grant execute on function public.list_live_broadcasts_now() to authenticated;

create or replace function public.get_live_broadcast_public(p_id uuid)
returns table (
  id uuid,
  tiktok_account_id uuid,
  live_session_id uuid,
  status text,
  title text,
  started_at timestamptz,
  ended_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select id, tiktok_account_id, live_session_id, status, title, started_at, ended_at
  from public.live_broadcasts
  where id = p_id and auth.uid() is not null;
$$;

revoke all on function public.get_live_broadcast_public(uuid) from public, anon;
grant execute on function public.get_live_broadcast_public(uuid) to authenticated;
