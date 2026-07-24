-- Deletes a managed TikTok account and everything scoped to it (admin_account_access,
-- scoring_rules, score_periods, live_sessions/live_participants, matches/match_results,
-- match_result_edits, caxetao_events/caxetao_registrations — every one of these already
-- has `tiktok_account_id ... on delete cascade` or cascades transitively through a table
-- that does, see CLAUDE.md's denormalization notes). `players` is untouched: it's global,
-- not owned by any single account (see CLAUDE.md "Players are global").
--
-- Same reasoning as create_tiktok_account (20260715000006): tiktok_accounts has no direct
-- delete policy on purpose, so this is the only path a client can use to delete one, and
-- it can enforce things RLS can't — here, that the caller re-types the account's own
-- handle, so a stray/duplicate click can't wipe an account's entire history unattended.
create or replace function public.delete_tiktok_account(
  p_account_id uuid,
  p_handle_confirmation text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_handle text;
begin
  if auth.uid() is null then
    raise exception 'delete_tiktok_account requires an authenticated admin';
  end if;

  if not public.is_account_owner(p_account_id) then
    raise exception 'only the account owner can delete this account';
  end if;

  select handle into v_handle from public.tiktok_accounts where id = p_account_id;

  if v_handle is null then
    raise exception 'account not found';
  end if;

  if lower(ltrim(trim(p_handle_confirmation), '@')) <> v_handle then
    raise exception 'handle confirmation does not match';
  end if;

  delete from public.tiktok_accounts where id = p_account_id;
end;
$$;

revoke all on function public.delete_tiktok_account(uuid, text) from public;
grant execute on function public.delete_tiktok_account(uuid, text) to authenticated;
