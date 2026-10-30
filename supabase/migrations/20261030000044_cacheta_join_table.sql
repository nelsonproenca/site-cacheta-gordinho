-- Fase 6, US2 (specs/001-cacheta-jogo-online): entrar numa mesa online já
-- criada. create_cacheta_table (20261029000041) só cria o assento do
-- criador quando mode = 'online' — os demais assentos ficam vagos até
-- outros jogadores reais chamarem esta função (contrato em
-- specs/001-cacheta-jogo-online/contracts/rpcs.md).
create or replace function public.join_cacheta_table(p_table_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_player_id uuid;
  v_table public.cacheta_tables;
  v_seat_count int;
  v_seat_id uuid;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'join_cacheta_table requires a logged-in player';
  end if;

  select * into v_table from public.cacheta_tables where id = p_table_id for update;
  if v_table is null then
    raise exception 'table not found';
  end if;
  if v_table.mode != 'online' then
    raise exception 'this table is not an online table';
  end if;
  if v_table.status != 'waiting' then
    raise exception 'table already started';
  end if;

  if exists (
    select 1 from public.cacheta_table_seats
    where table_id = p_table_id and player_id = v_player_id
  ) then
    raise exception 'you already have a seat at this table';
  end if;

  select count(*) into v_seat_count from public.cacheta_table_seats where table_id = p_table_id;
  if v_seat_count >= v_table.max_seats then
    raise exception 'table is full';
  end if;

  insert into public.cacheta_table_seats (table_id, seat_no, player_id, is_bot)
  values (p_table_id, v_seat_count, v_player_id, false)
  returning id into v_seat_id;

  return v_seat_id;
end;
$$;

revoke all on function public.join_cacheta_table(uuid) from public, anon;
grant execute on function public.join_cacheta_table(uuid) to authenticated;
