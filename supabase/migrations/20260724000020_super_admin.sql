-- Platform-wide super admin: a single flag on admins that bypasses the
-- per-account admin_account_access scoping entirely. This is a deliberate
-- override of the design note in CLAUDE.md ("Authorization should key off
-- admin_account_access, not a single global admin role") — the user
-- explicitly asked for someone who can manage every account and every
-- admin at once.
alter table public.admins
  add column is_super_admin boolean not null default false;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where id = auth.uid() and is_super_admin = true
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

-- Single choke point: has_account_access/is_account_owner
-- (20260715000003_admin_account_access.sql) back nearly every RLS policy in
-- the schema (scoring_rules, score_periods, live_sessions,
-- live_participants, matches, match_results, caxetao_events,
-- caxetao_registrations, match_result_edits, admin_account_access,
-- tiktok_accounts). Redefining these two here gives a super admin access to
-- every one of those tables for free, instead of editing ~14 policies
-- individually and risking missing one. create or replace preserves the
-- existing revoke/grant on these two functions.
create or replace function public.has_account_access(p_tiktok_account_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.admin_account_access aaa
      where aaa.tiktok_account_id = p_tiktok_account_id
        and aaa.admin_id = auth.uid()
    );
$$;

create or replace function public.is_account_owner(p_tiktok_account_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.admin_account_access aaa
      where aaa.tiktok_account_id = p_tiktok_account_id
        and aaa.admin_id = auth.uid()
        and aaa.role = 'owner'
    );
$$;

-- Gotcha this column addition creates: admins_approve_pending's with-check
-- (20260718000018_admins_approval.sql) only pins status = 'approved' — it
-- says nothing about any other column, so without this revoke any already
-- approved admin could call
-- `.update({ status: 'approved', is_super_admin: true })` on someone else's
-- pending row and self-escalate a sock-puppet account in one call. RLS row
-- policies can't cleanly express "this column is off-limits regardless of
-- the row predicate" — a column-level privilege revoke is the actual tool
-- for that. service_role is a separate Postgres role and is unaffected, so
-- promote/demote server actions (which go through the service-role client)
-- still work.
revoke update (is_super_admin) on public.admins from authenticated, anon;

-- Defense in depth on top of the revoke above (same "don't trust a single
-- layer" reasoning as matches_validate_account): a pending row is always
-- is_super_admin = false by construction, so pin it in the with-check too.
drop policy "admins_approve_pending" on public.admins;
create policy "admins_approve_pending"
  on public.admins
  for update
  using (status = 'pending' and public.is_approved_admin())
  with check (status = 'approved' and is_super_admin = false);

-- First super admin, seeded directly.
update public.admins set is_super_admin = true where email = 'nelsonhaproenca@gmail.com';
