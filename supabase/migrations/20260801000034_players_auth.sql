-- Fase 5, M0: player identity via SMS OTP login. `players` gains a link to
-- auth.users so a player can authenticate (comprar crédito, autoinscrição
-- paga, assistir/comentar/mandar presente numa live in-app — ver prd.md
-- §4.1/§4.10). auth_phone is the verified phone from the OTP session,
-- deliberately separate from the pre-existing `whatsapp` field (unverified,
-- free text) — the two are never matched against each other.
alter table public.players
  add column auth_user_id uuid unique references auth.users (id) on delete set null,
  add column auth_phone text unique;

-- handle_new_admin_user (20260715000001, redefined 20260724000024) fires on
-- every auth.users insert and unconditionally creates an `admins` row. A
-- player signing up via phone OTP has no email (admins.email is not null),
-- so without this branch every player's first login would fail the whole
-- auth.users insert. lib/actions/player-auth.ts sets `actor_type: 'player'`
-- in the signInWithOtp options.data for player signups; admin signup never
-- sends this key, so coalesce(..., 'admin') preserves today's behavior
-- exactly for the existing admin signup path.
create or replace function public.handle_new_admin_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'actor_type', 'admin') != 'admin' then
    return new;
  end if;

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

-- current_player_id(): same shape as has_account_access/is_account_owner
-- (20260715000003) — resolves the caller's own players row from auth.uid(),
-- security definer so it works regardless of players' own RLS.
create or replace function public.current_player_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select id from public.players where auth_user_id = auth.uid();
$$;

revoke all on function public.current_player_id() from public;
grant execute on function public.current_player_id() to authenticated;

-- link_or_create_player(): called right after a successful OTP verification
-- (lib/actions/player-auth.ts verifyPlayerOtp). Reads the verified phone from
-- auth.jwt() — never a client-supplied parameter, same anti-spoofing
-- reasoning as every other identity-resolving security-definer function in
-- this schema. A player who already exists because an admin quick-added them
-- by @handle during a live (tiktok_handle set, auth_user_id still null) gets
-- this phone linked to that same row instead of creating a duplicate —
-- confirmed decision: claim by @handle, not by phone-only matching.
create or replace function public.link_or_create_player(p_tiktok_handle text, p_display_name text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_phone text;
  v_handle text;
  v_player_id uuid;
  v_existing_auth_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'link_or_create_player requires an authenticated session';
  end if;

  v_phone := auth.jwt() ->> 'phone';
  if v_phone is null or v_phone = '' then
    raise exception 'no verified phone on session';
  end if;

  -- Repeat login: already linked.
  select id into v_player_id from public.players where auth_user_id = auth.uid();
  if v_player_id is not null then
    return v_player_id;
  end if;

  v_handle := lower(ltrim(coalesce(p_tiktok_handle, ''), '@'));
  if v_handle = '' then
    raise exception 'tiktok handle is required';
  end if;

  select id, auth_user_id into v_player_id, v_existing_auth_user_id
  from public.players
  where tiktok_handle = v_handle;

  if v_player_id is not null then
    if v_existing_auth_user_id is not null then
      raise exception 'this @handle is already linked to another account';
    end if;

    update public.players
    set auth_user_id = auth.uid(), auth_phone = v_phone
    where id = v_player_id;

    return v_player_id;
  end if;

  if p_display_name is null or btrim(p_display_name) = '' then
    raise exception 'display name is required for a new player';
  end if;

  insert into public.players (display_name, tiktok_handle, auth_user_id, auth_phone)
  values (btrim(p_display_name), v_handle, auth.uid(), v_phone)
  returning id into v_player_id;

  return v_player_id;
end;
$$;

revoke all on function public.link_or_create_player(text, text) from public;
grant execute on function public.link_or_create_player(text, text) to authenticated;
