-- specs/002-moedas-pagamento-indicacao, US3 — código/link de indicação e
-- comissão real sobre a taxa da casa gerada pelo indicado (FR-013 a FR-018).
create table public.referral_codes (
  player_id uuid primary key references public.players (id),
  code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.referral_codes enable row level security;

create policy "referral_codes_select_public"
  on public.referral_codes
  for select
  using (true);

-- Sem policy de insert/update direta — set_referral_code abaixo é o único
-- funil, e sem UPDATE nenhuma: definido uma vez, nunca mais muda (FR-013).

create table public.referral_links (
  referred_player_id uuid primary key references public.players (id),
  referrer_player_id uuid not null references public.players (id),
  created_at timestamptz not null default now(),
  check (referred_player_id != referrer_player_id)
);

alter table public.referral_links enable row level security;

create policy "referral_links_select_involved_or_admin"
  on public.referral_links
  for select
  using (
    referred_player_id = public.current_player_id()
    or referrer_player_id = public.current_player_id()
    or public.is_approved_admin()
  );

-- Sem policy de insert/update/delete — só link_or_create_player/
-- link_or_create_player_by_email (abaixo) escrevem aqui, no mesmo instante
-- em que a conta identificada nasce.

create or replace function public.set_referral_code(p_code text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_player_id uuid;
  v_code text;
begin
  if public.current_player_is_guest() then
    raise exception 'guests cannot set a referral code';
  end if;
  v_player_id := public.current_player_id();

  if exists (select 1 from public.referral_codes where player_id = v_player_id) then
    raise exception 'referral code already set';
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  if v_code = '' then
    raise exception 'referral code is required';
  end if;

  insert into public.referral_codes (player_id, code) values (v_player_id, v_code);
end;
$$;

revoke all on function public.set_referral_code(text) from public, anon;
grant execute on function public.set_referral_code(text) to authenticated;

-- Resolve um código de indicação para o player_id dono, ignorando
-- silenciosamente um código inválido/inexistente (contracts/rpcs.md: um
-- código digitado errado não deve impedir o cadastro) — reaproveitada pelas
-- duas funções de link_or_create abaixo.
create or replace function public.referral_resolve_and_link(p_new_player_id uuid, p_referral_code text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_referrer_id uuid;
  v_code text;
begin
  if p_referral_code is null or btrim(p_referral_code) = '' then
    return;
  end if;

  v_code := upper(regexp_replace(p_referral_code, '\s', '', 'g'));
  select player_id into v_referrer_id from public.referral_codes where code = v_code;

  if v_referrer_id is null or v_referrer_id = p_new_player_id then
    return;
  end if;

  insert into public.referral_links (referred_player_id, referrer_player_id)
  values (p_new_player_id, v_referrer_id)
  on conflict (referred_player_id) do nothing;
end;
$$;

revoke all on function public.referral_resolve_and_link(uuid, text) from public, anon, authenticated;

-- link_or_create_player: preserva todo o comportamento existente (telefone/
-- OTP); novo parâmetro opcional p_referral_code, só usado no caminho de
-- criação de conta nova (nunca em claim-by-handle nem repeat-login). DROP
-- explícito antes do CREATE pelo mesmo motivo de create_cacheta_table
-- acima (20261105000054) — mudar a lista de tipos de parâmetro cria um novo
-- overload em vez de substituir, e o antigo (2 argumentos) ganharia a
-- resolução para qualquer chamada existente com 2 argumentos.
drop function if exists public.link_or_create_player(text, text);

create function public.link_or_create_player(
  p_tiktok_handle text,
  p_display_name text,
  p_referral_code text default null
)
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

  perform public.referral_resolve_and_link(v_player_id, p_referral_code);

  return v_player_id;
end;
$$;

revoke all on function public.link_or_create_player(text, text, text) from public;
grant execute on function public.link_or_create_player(text, text, text) to authenticated;

-- link_or_create_player_by_email: nova — mesmo papel de link_or_create_player,
-- mas para o cadastro via Google (US4), resolvendo e-mail via auth.jwt() em
-- vez de telefone. Exige provider = 'google' como defesa em profundidade
-- (não é uma função genérica de "qualquer sessão com e-mail").
create or replace function public.link_or_create_player_by_email(
  p_handle text,
  p_display_name text,
  p_referral_code text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
  v_handle text;
  v_player_id uuid;
  v_existing_auth_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'link_or_create_player_by_email requires an authenticated session';
  end if;
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') != 'google' then
    raise exception 'this function is only for Google-authenticated sessions';
  end if;

  v_email := auth.jwt() ->> 'email';
  if v_email is null or v_email = '' then
    raise exception 'no verified email on session';
  end if;

  select id into v_player_id from public.players where auth_user_id = auth.uid();
  if v_player_id is not null then
    return v_player_id;
  end if;

  v_handle := lower(ltrim(coalesce(p_handle, ''), '@'));
  if v_handle = '' then
    raise exception 'handle is required';
  end if;

  select id, auth_user_id into v_player_id, v_existing_auth_user_id
  from public.players
  where tiktok_handle = v_handle;

  if v_player_id is not null then
    if v_existing_auth_user_id is not null then
      raise exception 'this @handle is already linked to another account';
    end if;

    update public.players
    set auth_user_id = auth.uid()
    where id = v_player_id;

    return v_player_id;
  end if;

  if p_display_name is null or btrim(p_display_name) = '' then
    raise exception 'display name is required for a new player';
  end if;

  insert into public.players (display_name, tiktok_handle, auth_user_id)
  values (btrim(p_display_name), v_handle, auth.uid())
  returning id into v_player_id;

  perform public.referral_resolve_and_link(v_player_id, p_referral_code);

  return v_player_id;
end;
$$;

revoke all on function public.link_or_create_player_by_email(text, text, text) from public, anon;
grant execute on function public.link_or_create_player_by_email(text, text, text) to authenticated;
