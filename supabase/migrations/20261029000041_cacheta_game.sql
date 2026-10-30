-- Fase 6, Foundational (specs/001-cacheta-jogo-online): jogo de Cacheta
-- jogável — mesa virtual, contra robôs e online. Frente nova e paralela ao
-- domínio existente de pontuação manual de lives (matches/match_results/
-- scoring_rules) — nenhuma FK cruza para lá; o único ponto de contato é
-- players.id, só lido, nunca escrito por este domínio (ver data-model.md).
--
-- Cinco tabelas: cacheta_tables (estado público da mesa), cacheta_table_seats
-- (um assento por participante, humano ou bot), cacheta_hands (a mão de cada
-- assento — privada), cacheta_table_decks (o monte de compra restante —
-- também privada, por um motivo diferente: não é "quem pode ver", é "se
-- qualquer assento visse a ordem das cartas restantes, saberia o futuro da
-- partida" — por isso não tem NENHUMA policy de SELECT, nem mesmo restrita
-- ao próprio dono, só as funções abaixo tocam nela via security definer),
-- cacheta_moves (log append-only de jogadas). Nenhuma tem policy de
-- INSERT/UPDATE direta para anon/authenticated — toda mutação passa por uma
-- função security definer abaixo, resolvendo a identidade do chamador via
-- current_player_id() (20260801000034), nunca um seat_id/player_id vindo do
-- cliente sem validar contra ela (constituição, Princípio II).

create table public.cacheta_tables (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('bots', 'online')),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  max_seats int not null check (max_seats between 2 and 6),
  monte_count int not null default 0,
  discard_pile jsonb not null default '[]'::jsonb,
  vira jsonb,
  coringa jsonb,
  turn_seat_id uuid,
  turn_deadline_at timestamptz,
  winner_seat_id uuid,
  created_by uuid not null references public.players (id),
  created_at timestamptz not null default now()
);

create table public.cacheta_table_seats (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.cacheta_tables (id) on delete cascade,
  seat_no int not null,
  player_id uuid references public.players (id),
  is_bot boolean not null default false,
  hand_count int not null default 0,
  status text not null default 'active' check (status in ('active', 'eliminated', 'batido')),
  joined_at timestamptz not null default now(),
  unique (table_id, seat_no),
  check ((player_id is null) = is_bot)
);

-- turn_seat_id/winner_seat_id reference a row in a table created just above.
alter table public.cacheta_tables
  add constraint cacheta_tables_turn_seat_fkey foreign key (turn_seat_id) references public.cacheta_table_seats (id),
  add constraint cacheta_tables_winner_seat_fkey foreign key (winner_seat_id) references public.cacheta_table_seats (id);

create table public.cacheta_hands (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.cacheta_tables (id) on delete cascade,
  seat_id uuid not null unique references public.cacheta_table_seats (id) on delete cascade,
  cards jsonb not null default '[]'::jsonb
);

-- Não confundir com "privado ao dono" (como cacheta_hands) — este é privado
-- a TODO MUNDO, inclusive o próprio dono, porque conhecer a ordem do monte
-- restante é uma vantagem de jogo injusta, não uma questão de "de quem é a
-- informação". Daí nenhuma policy de select abaixo, nem "_select_own".
create table public.cacheta_table_decks (
  table_id uuid primary key references public.cacheta_tables (id) on delete cascade,
  monte jsonb not null default '[]'::jsonb
);

create table public.cacheta_moves (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.cacheta_tables (id) on delete cascade,
  seat_id uuid not null references public.cacheta_table_seats (id) on delete cascade,
  type text not null check (type in ('draw_monte', 'draw_discard', 'discard', 'bater', 'expire')),
  card jsonb,
  created_at timestamptz not null default now()
);

alter table public.cacheta_tables enable row level security;
alter table public.cacheta_table_seats enable row level security;
alter table public.cacheta_hands enable row level security;
alter table public.cacheta_table_decks enable row level security;
alter table public.cacheta_moves enable row level security;

-- SELECT amplo a quem tem assento na mesa, nas tabelas de estado público —
-- deliberadamente não mais restrito que isso (research.md §2: mais estreito
-- arriscaria quebrar a entrega de eventos postgres_changes, mesmo raciocínio
-- já documentado para live_chat_messages).
create policy "cacheta_tables_select_seated"
  on public.cacheta_tables
  for select
  using (
    exists (
      select 1 from public.cacheta_table_seats s
      where s.table_id = cacheta_tables.id and s.player_id = public.current_player_id()
    )
  );

create policy "cacheta_table_seats_select_seated"
  on public.cacheta_table_seats
  for select
  using (
    exists (
      select 1 from public.cacheta_table_seats s
      where s.table_id = cacheta_table_seats.table_id and s.player_id = public.current_player_id()
    )
  );

create policy "cacheta_moves_select_seated"
  on public.cacheta_moves
  for select
  using (
    exists (
      select 1 from public.cacheta_table_seats s
      where s.table_id = cacheta_moves.table_id and s.player_id = public.current_player_id()
    )
  );

-- A mão é privada ao próprio dono do assento — não "qualquer um na mesa"
-- (research.md §2: a mão nunca é vista por outro jogador em nenhum momento).
create policy "cacheta_hands_select_own"
  on public.cacheta_hands
  for select
  using (
    exists (
      select 1 from public.cacheta_table_seats s
      where s.id = cacheta_hands.seat_id and s.player_id = public.current_player_id()
    )
  );

-- cacheta_table_decks: nenhuma policy de select — RLS habilitada sem
-- nenhuma policy nega acesso a todo mundo, inclusive ao próprio dono. Só as
-- funções security definer abaixo leem/escrevem esta tabela.

-- Nenhuma das tabelas acima tem policy de insert/update/delete para
-- anon/authenticated — toda mutação é uma das funções abaixo.

create or replace function public.create_cacheta_table(p_mode text, p_max_seats int)
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

  if exists (
    select 1 from public.cacheta_table_seats s
    join public.cacheta_tables t on t.id = s.table_id
    where s.player_id = v_player_id and t.status != 'finished'
  ) then
    raise exception 'you already have an active table';
  end if;

  insert into public.cacheta_tables (mode, max_seats, created_by)
  values (p_mode, p_max_seats, v_player_id)
  returning id into v_table_id;

  insert into public.cacheta_table_seats (table_id, seat_no, player_id, is_bot)
  values (v_table_id, 0, v_player_id, false)
  returning id into v_seat_id;

  if p_mode = 'bots' then
    for v_i in 1..(p_max_seats - 1) loop
      insert into public.cacheta_table_seats (table_id, seat_no, is_bot)
      values (v_table_id, v_i, true);
    end loop;
  end if;

  return v_table_id;
end;
$$;

create or replace function public.start_cacheta_game(p_table_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_player_id uuid;
  v_table public.cacheta_tables;
  v_deck jsonb;
  v_seat record;
  v_hand jsonb;
  v_vira jsonb;
  v_coringa_rank int;
  v_first_seat_id uuid;
  v_seat_count int;
  v_deck_pos int := 0;
  v_remaining jsonb;
begin
  v_player_id := public.current_player_id();
  select * into v_table from public.cacheta_tables where id = p_table_id for update;
  if v_table is null then
    raise exception 'table not found';
  end if;
  if v_table.created_by != v_player_id then
    raise exception 'only the table creator can start the game';
  end if;
  if v_table.status != 'waiting' then
    raise exception 'table already started';
  end if;

  select count(*) into v_seat_count from public.cacheta_table_seats where table_id = p_table_id;
  if v_seat_count < 2 then
    raise exception 'not enough seats to start';
  end if;

  -- Monte dobrado (2 baralhos de 52, sem coringas impressos — ver
  -- lib/cacheta/cards.ts) embaralhado com random() como chave de ordenação.
  select jsonb_agg(jsonb_build_object('suit', suit, 'rank', rank) order by random())
  into v_deck
  from (
    select suit, rank
    from unnest(array['copas','ouros','paus','espadas']) as suit
    cross join unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13]) as rank
    cross join generate_series(1, 2)
  ) d;

  for v_seat in select id from public.cacheta_table_seats where table_id = p_table_id order by seat_no loop
    select jsonb_agg(c) into v_hand
    from jsonb_array_elements(v_deck) with ordinality as t(c, i)
    where i between v_deck_pos + 1 and v_deck_pos + 9;

    insert into public.cacheta_hands (table_id, seat_id, cards) values (p_table_id, v_seat.id, coalesce(v_hand, '[]'::jsonb));
    update public.cacheta_table_seats set hand_count = 9 where id = v_seat.id;
    v_deck_pos := v_deck_pos + 9;
  end loop;

  select c into v_vira
  from jsonb_array_elements(v_deck) with ordinality as t(c, i)
  where i = v_deck_pos + 1;
  v_deck_pos := v_deck_pos + 1;
  v_coringa_rank := (((v_vira->>'rank')::int % 13) + 1);

  select jsonb_agg(c) into v_remaining
  from jsonb_array_elements(v_deck) with ordinality as t(c, i)
  where i > v_deck_pos;
  v_remaining := coalesce(v_remaining, '[]'::jsonb);

  insert into public.cacheta_table_decks (table_id, monte) values (p_table_id, v_remaining);

  select id into v_first_seat_id from public.cacheta_table_seats where table_id = p_table_id order by seat_no limit 1;

  update public.cacheta_tables
  set status = 'playing',
      vira = v_vira,
      coringa = jsonb_build_object('suit', v_vira->>'suit', 'rank', v_coringa_rank),
      monte_count = jsonb_array_length(v_remaining),
      discard_pile = '[]'::jsonb,
      turn_seat_id = v_first_seat_id,
      turn_deadline_at = now() + interval '15 seconds'
  where id = p_table_id;
end;
$$;

-- Resolve o assento do chamador numa mesa, levantando exceção se ele não
-- tiver assento ali — reaproveitada por todas as funções de jogada abaixo
-- para não repetir a mesma checagem 6 vezes.
create or replace function public.cacheta_caller_seat(p_table_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_player_id uuid;
  v_seat_id uuid;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'requires a logged-in player';
  end if;
  select id into v_seat_id from public.cacheta_table_seats where table_id = p_table_id and player_id = v_player_id;
  if v_seat_id is null then
    raise exception 'you do not have a seat at this table';
  end if;
  return v_seat_id;
end;
$$;

-- Reabastece o monte embaralhando a pilha de descarte (regra confirmada em
-- spec.md Edge Cases) quando o monte se esgota durante uma rodada.
create or replace function public.cacheta_reshuffle_if_empty(p_table_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_monte jsonb;
  v_discard jsonb;
begin
  select monte into v_monte from public.cacheta_table_decks where table_id = p_table_id for update;
  if jsonb_array_length(v_monte) > 0 then
    return;
  end if;

  select discard_pile into v_discard from public.cacheta_tables where id = p_table_id for update;
  if jsonb_array_length(v_discard) <= 1 then
    return; -- nada para reembaralhar além do topo visível
  end if;

  select jsonb_agg(c order by random())
  into v_monte
  from jsonb_array_elements(v_discard) with ordinality as t(c, i)
  where i < jsonb_array_length(v_discard); -- mantém a carta do topo visível fora do reembaralhamento

  update public.cacheta_table_decks set monte = coalesce(v_monte, '[]'::jsonb) where table_id = p_table_id;
  update public.cacheta_tables
  set discard_pile = jsonb_build_array(v_discard -> (jsonb_array_length(v_discard) - 1)),
      monte_count = jsonb_array_length(coalesce(v_monte, '[]'::jsonb))
  where id = p_table_id;
end;
$$;

create or replace function public.draw_from_monte(p_table_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_seat_id uuid;
  v_hand jsonb;
  v_monte jsonb;
  v_card jsonb;
begin
  v_seat_id := public.cacheta_caller_seat(p_table_id);

  if (select turn_seat_id from public.cacheta_tables where id = p_table_id) != v_seat_id then
    raise exception 'it is not your turn';
  end if;

  select cards into v_hand from public.cacheta_hands where seat_id = v_seat_id for update;
  if jsonb_array_length(v_hand) != 9 then
    raise exception 'you already drew this turn';
  end if;

  perform public.cacheta_reshuffle_if_empty(p_table_id);

  select monte into v_monte from public.cacheta_table_decks where table_id = p_table_id for update;
  if jsonb_array_length(v_monte) = 0 then
    raise exception 'monte is empty';
  end if;

  v_card := v_monte -> (jsonb_array_length(v_monte) - 1);
  update public.cacheta_table_decks set monte = v_monte - (jsonb_array_length(v_monte) - 1) where table_id = p_table_id;
  update public.cacheta_hands set cards = v_hand || v_card where seat_id = v_seat_id;
  update public.cacheta_table_seats set hand_count = 10 where id = v_seat_id;
  update public.cacheta_tables set monte_count = jsonb_array_length(v_monte) - 1 where id = p_table_id;

  insert into public.cacheta_moves (table_id, seat_id, type, card) values (p_table_id, v_seat_id, 'draw_monte', v_card);

  return v_card;
end;
$$;

create or replace function public.draw_from_discard(p_table_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_seat_id uuid;
  v_hand jsonb;
  v_discard jsonb;
  v_card jsonb;
begin
  v_seat_id := public.cacheta_caller_seat(p_table_id);

  if (select turn_seat_id from public.cacheta_tables where id = p_table_id) != v_seat_id then
    raise exception 'it is not your turn';
  end if;

  select cards into v_hand from public.cacheta_hands where seat_id = v_seat_id for update;
  if jsonb_array_length(v_hand) != 9 then
    raise exception 'you already drew this turn';
  end if;

  select discard_pile into v_discard from public.cacheta_tables where id = p_table_id for update;
  if jsonb_array_length(v_discard) = 0 then
    raise exception 'discard pile is empty';
  end if;

  v_card := v_discard -> (jsonb_array_length(v_discard) - 1);
  update public.cacheta_tables set discard_pile = v_discard - (jsonb_array_length(v_discard) - 1) where id = p_table_id;
  update public.cacheta_hands set cards = v_hand || v_card where seat_id = v_seat_id;
  update public.cacheta_table_seats set hand_count = 10 where id = v_seat_id;

  insert into public.cacheta_moves (table_id, seat_id, type, card) values (p_table_id, v_seat_id, 'draw_discard', v_card);

  return v_card;
end;
$$;

-- Avança a vez para o próximo assento 'active' (pula eliminados/batidos),
-- redefine o prazo de 15s — reaproveitada por discard_card e expire_turn.
create or replace function public.cacheta_advance_turn(p_table_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_current_seat_no int;
  v_max_seats int;
  v_next_seat_id uuid;
  v_i int;
begin
  select s.seat_no, t.max_seats into v_current_seat_no, v_max_seats
  from public.cacheta_tables t
  join public.cacheta_table_seats s on s.id = t.turn_seat_id
  where t.id = p_table_id;

  for v_i in 1..v_max_seats loop
    select id into v_next_seat_id
    from public.cacheta_table_seats
    where table_id = p_table_id
      and seat_no = (v_current_seat_no + v_i) % v_max_seats
      and status = 'active';
    exit when v_next_seat_id is not null;
  end loop;

  update public.cacheta_tables
  set turn_seat_id = v_next_seat_id,
      turn_deadline_at = case when v_next_seat_id is not null then now() + interval '15 seconds' else null end
  where id = p_table_id;
end;
$$;

create or replace function public.discard_card(p_table_id uuid, p_card jsonb)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_seat_id uuid;
  v_hand jsonb;
  v_idx int;
begin
  v_seat_id := public.cacheta_caller_seat(p_table_id);

  if (select turn_seat_id from public.cacheta_tables where id = p_table_id) != v_seat_id then
    raise exception 'it is not your turn';
  end if;

  select cards into v_hand from public.cacheta_hands where seat_id = v_seat_id for update;
  if jsonb_array_length(v_hand) != 10 then
    raise exception 'draw a card before discarding';
  end if;

  select i - 1 into v_idx
  from jsonb_array_elements(v_hand) with ordinality as t(c, i)
  where c = p_card
  limit 1;
  if v_idx is null then
    raise exception 'that card is not in your hand';
  end if;

  update public.cacheta_hands set cards = v_hand - v_idx where seat_id = v_seat_id;
  update public.cacheta_table_seats set hand_count = 9 where id = v_seat_id;
  update public.cacheta_tables set discard_pile = discard_pile || p_card where id = p_table_id;

  insert into public.cacheta_moves (table_id, seat_id, type, card) values (p_table_id, v_seat_id, 'discard', p_card);

  perform public.cacheta_advance_turn(p_table_id);
end;
$$;

-- Chamável por qualquer assento da mesa (não só o da vez) — reconfirma o
-- prazo com "for update" antes de agir, idempotente sob chamada dupla.
create or replace function public.expire_turn(p_table_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_seat_id uuid;
  v_deadline timestamptz;
  v_hand jsonb;
  v_card jsonb;
begin
  perform public.cacheta_caller_seat(p_table_id); -- exige que o chamador tenha assento na mesa

  select turn_seat_id, turn_deadline_at into v_seat_id, v_deadline
  from public.cacheta_tables where id = p_table_id for update;

  if v_seat_id is null or v_deadline is null or now() <= v_deadline then
    return; -- idempotente: nada a expirar
  end if;

  select cards into v_hand from public.cacheta_hands where seat_id = v_seat_id for update;

  -- Comportamento padrão de expiração (spec Assumptions): descarta
  -- automaticamente a primeira carta da mão, sem comprar — vale tanto se o
  -- jogador já tinha comprado (mão de 10) quanto se não chegou a agir (mão
  -- de 9), em ambos os casos a mão volta a 9 cartas (ou menos, se já estava
  -- em 9) depois de uma única carta sair.
  v_card := v_hand -> 0;
  update public.cacheta_hands set cards = v_hand - 0 where seat_id = v_seat_id;
  update public.cacheta_table_seats
    set hand_count = jsonb_array_length(v_hand) - 1
    where id = v_seat_id;
  update public.cacheta_tables set discard_pile = discard_pile || v_card where id = p_table_id;

  insert into public.cacheta_moves (table_id, seat_id, type, card) values (p_table_id, v_seat_id, 'expire', v_card);

  perform public.cacheta_advance_turn(p_table_id);
end;
$$;

revoke all on function public.create_cacheta_table(text, int) from public, anon;
grant execute on function public.create_cacheta_table(text, int) to authenticated;
revoke all on function public.start_cacheta_game(uuid) from public, anon;
grant execute on function public.start_cacheta_game(uuid) to authenticated;
revoke all on function public.cacheta_caller_seat(uuid) from public, anon;
grant execute on function public.cacheta_caller_seat(uuid) to authenticated;
revoke all on function public.cacheta_reshuffle_if_empty(uuid) from public, anon;
grant execute on function public.cacheta_reshuffle_if_empty(uuid) to authenticated;
revoke all on function public.draw_from_monte(uuid) from public, anon;
grant execute on function public.draw_from_monte(uuid) to authenticated;
revoke all on function public.draw_from_discard(uuid) from public, anon;
grant execute on function public.draw_from_discard(uuid) to authenticated;
revoke all on function public.cacheta_advance_turn(uuid) from public, anon;
grant execute on function public.cacheta_advance_turn(uuid) to authenticated;
revoke all on function public.discard_card(uuid, jsonb) from public, anon;
grant execute on function public.discard_card(uuid, jsonb) to authenticated;
revoke all on function public.expire_turn(uuid) from public, anon;
grant execute on function public.expire_turn(uuid) to authenticated;

alter publication supabase_realtime add table public.cacheta_tables;
alter publication supabase_realtime add table public.cacheta_table_seats;
alter publication supabase_realtime add table public.cacheta_hands;
alter publication supabase_realtime add table public.cacheta_moves;
