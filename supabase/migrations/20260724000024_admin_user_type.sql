-- New global classification, orthogonal to admin_account_access.role
-- ('owner'|'moderator', English, per-account, unchanged): every non-super-admin
-- now declares itself a 'streamer' (can own/moderate several tiktok_accounts,
-- exactly like today) or a 'moderador' (Portuguese, deliberately spelled
-- differently from admin_account_access's 'moderator' so the two never get
-- typo-confused in code — this one names a person's relationship to another
-- admin, not a row's access level on one account). admin_account_access
-- stays the actual RLS-backing access mechanism; user_type/streamer_id are an
-- identity/signup layer on top, not a replacement.
alter table public.admins
  add column user_type text check (user_type in ('streamer', 'moderador')),
  add column streamer_id uuid references public.admins (id) on delete set null;

alter table public.admins
  add constraint admins_moderador_requires_streamer
  check ((user_type = 'moderador') = (streamer_id is not null));

-- Defense in depth against a manipulated signup form submitting an arbitrary
-- admin id as streamer_id (same reasoning as matches_validate_account): the
-- referenced row must actually be a streamer.
create or replace function public.admins_validate_streamer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_type text;
begin
  if new.streamer_id is not null then
    select user_type into v_type from public.admins where id = new.streamer_id;
    if v_type is distinct from 'streamer' then
      raise exception 'admins.streamer_id must reference an admin with user_type = streamer';
    end if;
  end if;
  return new;
end;
$$;

create trigger admins_check_streamer_link
  before insert or update of streamer_id on public.admins
  for each row execute function public.admins_validate_streamer();

-- handle_new_admin_user (20260715000001) only read `name` from signup
-- metadata. The signup form now also submits user_type/streamer_id (see
-- lib/actions/auth.ts signUp) through the same auth.signUp options.data
-- mechanism — extend the trigger to persist them at row-creation time, same
-- invariant as before: this row is only ever written by this trigger.
create or replace function public.handle_new_admin_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.admins (id, name, email, user_type, streamer_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data ->> 'user_type', ''),
    nullif(new.raw_user_meta_data ->> 'streamer_id', '')::uuid
  );
  return new;
end;
$$;

-- Approving a 'moderador' now has to do more than flip status: it must also
-- grant them the same admin_account_access rows their linked streamer has.
-- The approving admin isn't necessarily an owner of those accounts (only the
-- streamer is), so this needs security definer — same shape as
-- create_tiktok_account. This RPC becomes the *only* approval path (mirrors
-- "no direct insert policy on tiktok_accounts, only via RPC"): the old
-- admins_approve_pending UPDATE policy is dropped below.
create or replace function public.approve_pending_admin(p_admin_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_target public.admins;
begin
  if not public.is_approved_admin() then
    raise exception 'approve_pending_admin requires an approved admin';
  end if;

  select * into v_target from public.admins where id = p_admin_id and status = 'pending';
  if v_target.id is null then
    raise exception 'admin not found or not pending';
  end if;

  update public.admins set status = 'approved' where id = p_admin_id;

  if v_target.user_type = 'moderador' and v_target.streamer_id is not null then
    insert into public.admin_account_access (admin_id, tiktok_account_id, role)
    select p_admin_id, aaa.tiktok_account_id, 'moderator'
    from public.admin_account_access aaa
    where aaa.admin_id = v_target.streamer_id
    on conflict (admin_id, tiktok_account_id) do nothing;
  end if;
end;
$$;

revoke all on function public.approve_pending_admin(uuid) from public;
grant execute on function public.approve_pending_admin(uuid) to authenticated;

drop policy "admins_approve_pending" on public.admins;

-- Cosmetic backfill — is_super_admin already bypasses every user_type-based
-- check, so this doesn't change behavior, just keeps the classification
-- consistent for display purposes (the existing super admin already owns
-- accounts, same shape as a streamer).
update public.admins set user_type = 'streamer' where is_super_admin = true;
