-- specs/002-moedas-pagamento-indicacao, Foundational (research.md §2): precisa
-- de um jeito explícito e auditável de distinguir jogador convidado
-- (signInAnonymously) de jogador identificado, para todo gate de dinheiro
-- (carteira, mesa paga, indicação) — nunca depender de auth.users.is_anonymous
-- (mesmo raciocínio já usado para o guard de handle_new_admin_user em
-- 20261030000047: disponibilidade varia por versão do GoTrue).
alter table public.players
  add column is_guest boolean not null default false;

-- Redefine só para setar is_guest = true no insert novo — resto do corpo
-- idêntico ao de 20261030000046.
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

  select id into v_player_id from public.players where auth_user_id = auth.uid();
  if v_player_id is not null then
    return v_player_id;
  end if;

  v_display_name := btrim(coalesce(p_display_name, ''));
  if v_display_name = '' then
    raise exception 'display name is required';
  end if;

  v_handle := 'guest-' || replace(auth.uid()::text, '-', '');

  insert into public.players (display_name, tiktok_handle, auth_user_id, is_guest)
  values (v_display_name, v_handle, auth.uid(), true)
  returning id into v_player_id;

  return v_player_id;
end;
$$;

revoke all on function public.link_or_create_guest_player(text) from public;
grant execute on function public.link_or_create_guest_player(text) to authenticated;
