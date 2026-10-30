-- Fase 6 follow-up: the user decided the Cacheta game must not require
-- phone-OTP login (unlike /ao-vivo and /minha-conta, which keep that gate
-- per prd.md §4.14's explicit "sem vitrine pública anônima" decision) — a
-- visitor should just type a display name and play. Supabase Anonymous Auth
-- (signInAnonymously(), enabled via config.toml's enable_anonymous_sign_ins)
-- still issues a real auth.uid()/session, so current_player_id() and every
-- RLS policy already keyed off it (cacheta_tables, cacheta_table_seats, ...)
-- work completely unchanged — only the identity-creation step differs from
-- link_or_create_player (20260801000034): no phone, a generated unique
-- tiktok_handle instead of one the visitor provides.
create or replace function public.link_or_create_guest_player(p_display_name text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_player_id uuid;
  v_display_name text;
  v_handle text;
begin
  if auth.uid() is null then
    raise exception 'link_or_create_guest_player requires an authenticated session';
  end if;

  -- Repeat visit on the same (anonymous) session: already linked.
  select id into v_player_id from public.players where auth_user_id = auth.uid();
  if v_player_id is not null then
    return v_player_id;
  end if;

  v_display_name := btrim(coalesce(p_display_name, ''));
  if v_display_name = '' then
    raise exception 'display name is required';
  end if;

  -- tiktok_handle is not null unique with no real handle to offer here —
  -- generate one from the auth user's own id, so it can never collide.
  v_handle := 'guest-' || replace(auth.uid()::text, '-', '');

  insert into public.players (display_name, tiktok_handle, auth_user_id)
  values (v_display_name, v_handle, auth.uid())
  returning id into v_player_id;

  return v_player_id;
end;
$$;

revoke all on function public.link_or_create_guest_player(text) from public;
grant execute on function public.link_or_create_guest_player(text) to authenticated;
