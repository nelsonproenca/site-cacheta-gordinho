-- scoring_rules stops being per-account: the user wants one platform-wide
-- points system instead of every streamer maintaining their own copy.
-- Verified before writing this: 2 accounts × 4 identical default rules (8
-- rows), zero match_results/cross_account_matches referencing any of them
-- yet — safe to dedupe without touching any FK.

-- Policy depends on the column being dropped below — must go first.
drop policy "scoring_rules_write_admin" on public.scoring_rules;

delete from public.scoring_rules
where tiktok_account_id <> (
  select tiktok_account_id from public.scoring_rules order by created_at limit 1
);

alter table public.scoring_rules
  drop column tiktok_account_id;

-- Global data now needs a global write gate. Per-account access
-- (has_account_access) no longer means anything here — only a super admin
-- can create/edit/deactivate/delete a rule that affects every account's
-- game at once. Read stays public (scoring_rules_select_public, unchanged).
create policy "scoring_rules_write_super_admin"
  on public.scoring_rules
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- create_tiktok_account no longer seeds scoring_rules — there's nothing
-- per-account left to seed. New accounts just read whatever global rules
-- already exist.
create or replace function public.create_tiktok_account(
  p_handle text,
  p_display_name text,
  p_avatar_url text default null
)
returns public.tiktok_accounts
language plpgsql
security definer set search_path = public
as $$
declare
  v_account public.tiktok_accounts;
begin
  if auth.uid() is null then
    raise exception 'create_tiktok_account requires an authenticated admin';
  end if;

  if not public.is_approved_admin() then
    raise exception 'create_tiktok_account requires an approved admin';
  end if;

  insert into public.tiktok_accounts (handle, display_name, avatar_url)
  values (lower(ltrim(p_handle, '@')), p_display_name, p_avatar_url)
  returning * into v_account;

  insert into public.admin_account_access (admin_id, tiktok_account_id, role)
  values (auth.uid(), v_account.id, 'owner');

  return v_account;
end;
$$;
