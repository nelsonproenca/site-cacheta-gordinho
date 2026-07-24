-- Fixes delete_tiktok_account (20260724000021): match_results.scoring_rule_id
-- and match_result_edits.previous_scoring_rule_id/new_scoring_rule_id have no
-- ON DELETE CASCADE to scoring_rules by design (20260715000011 — historical
-- points must never dangle silently on an ordinary scoring_rule delete), so
-- deleting the account cascaded into scoring_rules before those two tables'
-- rows were gone, and Postgres raised "update or delete on table
-- \"scoring_rules\" violates foreign key constraint ...". Same fix
-- scripts/smoke-test.ts cleanup() already applies for its own throwaway
-- accounts: clear the tables that reference scoring_rules explicitly, before
-- the delete that cascades through matches -> scoring_rules.
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

  delete from public.match_result_edits where tiktok_account_id = p_account_id;
  delete from public.match_results
  where match_id in (select id from public.matches where tiktok_account_id = p_account_id);

  delete from public.tiktok_accounts where id = p_account_id;
end;
$$;
