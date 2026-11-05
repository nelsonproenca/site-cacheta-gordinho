-- specs/002-moedas-pagamento-indicacao, US2 — estende o jogo de Cacheta já
-- existente (specs/001-cacheta-jogo-online/) com mesas pagas, em vez de
-- criar uma segunda camada paralela (research.md §6). Mesa paga só no modo
-- online — a casa não "paga" o pote de um bot.
alter table public.cacheta_tables
  add column entry_amount int not null default 0 check (entry_amount >= 0),
  add constraint cacheta_tables_entry_online_only check (entry_amount = 0 or mode = 'online');

alter table public.cacheta_tables
  drop constraint cacheta_tables_status_check,
  add constraint cacheta_tables_status_check check (status in ('waiting', 'playing', 'finished', 'cancelled'));

-- create_cacheta_table: preserva todo o comportamento existente; novo
-- parâmetro opcional p_entry_amount (retrocompatível com as duas chamadas
-- existentes, que não o passam). Precisa de DROP explícito antes do CREATE —
-- mudar a lista de tipos de parâmetro faz do CREATE OR REPLACE um *novo*
-- overload em vez de substituir o antigo (identidade de função no Postgres é
-- nome + tipos de parâmetro), e o overload antigo (2 argumentos) ganharia a
-- resolução para qualquer chamada existente com 2 argumentos por ser uma
-- correspondência exata de aridade, sem nunca rodar a lógica de entry_amount.
drop function if exists public.create_cacheta_table(text, int);

create function public.create_cacheta_table(p_mode text, p_max_seats int, p_entry_amount int default 0)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_player_id uuid;
  v_table_id uuid;
  v_seat_id uuid;
  v_i int;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'create_cacheta_table requires a logged-in player';
  end if;

  if p_mode not in ('bots', 'online') then
    raise exception 'invalid mode: %', p_mode;
  end if;
  if p_max_seats < 2 or p_max_seats > 6 then
    raise exception 'max_seats must be between 2 and 6';
  end if;
  if p_entry_amount < 0 then
    raise exception 'entry_amount must not be negative';
  end if;
  if p_entry_amount > 0 then
    if p_mode != 'online' then
      raise exception 'paid tables are online-only';
    end if;
    if public.current_player_is_guest() then
      raise exception 'guests cannot create a paid table';
    end if;
  end if;

  if exists (
    select 1 from public.cacheta_table_seats s
    join public.cacheta_tables t on t.id = s.table_id
    where s.player_id = v_player_id and t.status not in ('finished', 'cancelled')
  ) then
    raise exception 'you already have an active table';
  end if;

  insert into public.cacheta_tables (mode, max_seats, created_by, entry_amount)
  values (p_mode, p_max_seats, v_player_id, p_entry_amount)
  returning id into v_table_id;

  insert into public.cacheta_table_seats (table_id, seat_no, player_id, is_bot)
  values (v_table_id, 0, v_player_id, false)
  returning id into v_seat_id;

  if p_entry_amount > 0 then
    perform public.wallet_debit(v_player_id, p_entry_amount, 'table_entry', v_table_id);
  end if;

  if p_mode = 'bots' then
    for v_i in 1..(p_max_seats - 1) loop
      insert into public.cacheta_table_seats (table_id, seat_no, is_bot)
      values (v_table_id, v_i, true);
    end loop;
  end if;

  return v_table_id;
end;
$$;

-- O DROP acima apagou os privilégios herdados; esta função agora move
-- dinheiro quando p_entry_amount > 0, então ganha um revoke/grant explícito
-- (Princípio IV) em vez de ficar só nos privilégios automáticos de CREATE.
revoke all on function public.create_cacheta_table(text, int, int) from public, anon;
grant execute on function public.create_cacheta_table(text, int, int) to authenticated;

-- join_cacheta_table: preserva comportamento existente; debita a entrada do
-- jogador que está sentando quando a mesa é paga.
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

  if v_table.entry_amount > 0 and public.current_player_is_guest() then
    raise exception 'guests cannot join a paid table';
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

  if v_table.entry_amount > 0 then
    perform public.wallet_debit(v_player_id, v_table.entry_amount, 'table_entry', p_table_id);
  end if;

  insert into public.cacheta_table_seats (table_id, seat_no, player_id, is_bot)
  values (p_table_id, v_seat_count, v_player_id, false)
  returning id into v_seat_id;

  return v_seat_id;
end;
$$;

-- cancel_cacheta_table: nova — só o criador, só enquanto 'waiting', estorna
-- cada assento humano já sentado (edge case da spec: mesa paga abandonada
-- antes de encher não gera taxa da casa nem comissão).
create or replace function public.cancel_cacheta_table(p_table_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_player_id uuid;
  v_table public.cacheta_tables;
  v_seat record;
begin
  v_player_id := public.current_player_id();
  select * into v_table from public.cacheta_tables where id = p_table_id for update;
  if v_table is null then
    raise exception 'table not found';
  end if;
  if v_table.created_by != v_player_id then
    raise exception 'only the table creator can cancel it';
  end if;
  if v_table.status != 'waiting' then
    raise exception 'table already started or already finished';
  end if;

  if v_table.entry_amount > 0 then
    for v_seat in
      select player_id from public.cacheta_table_seats
      where table_id = p_table_id and player_id is not null
    loop
      perform public.wallet_credit(v_seat.player_id, v_table.entry_amount, 'table_refund', p_table_id);
    end loop;
  end if;

  update public.cacheta_tables set status = 'cancelled' where id = p_table_id;
end;
$$;

revoke all on function public.cancel_cacheta_table(uuid) from public, anon;
grant execute on function public.cancel_cacheta_table(uuid) to authenticated;
