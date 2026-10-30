-- Fase 6, US1 (specs/001-cacheta-jogo-online/tasks.md T015): avança a vez de
-- um assento bot. Chamada em loop pelo cliente (qualquer assento da mesa,
-- não só o próprio bot — um bot não tem player_id/sessão própria) depois de
-- cada jogada humana bem-sucedida, enquanto turn_seat_id apontar para um
-- is_bot = true (research.md §5: mesmo raciocínio lazy sem cron já usado em
-- closeStaleLiveSessions/syncCachetaoEventStatus).

create or replace function public.advance_bot_turn(p_table_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_seat_id uuid;
  v_is_bot boolean;
  v_hand jsonb;
  v_monte jsonb;
  v_drawn jsonb;
  v_discard_idx int;
  v_best_idx int;
  v_best_score int;
  v_i int;
  v_score int;
  v_card jsonb;
  v_other jsonb;
begin
  perform public.cacheta_caller_seat(p_table_id); -- exige que o chamador tenha assento na mesa

  select t.turn_seat_id, s.is_bot into v_seat_id, v_is_bot
  from public.cacheta_tables t
  join public.cacheta_table_seats s on s.id = t.turn_seat_id
  where t.id = p_table_id
  for update;

  if v_seat_id is null or not coalesce(v_is_bot, false) then
    return false;
  end if;

  -- Compra: sempre do monte, por simplicidade (heurística de robô trivial —
  -- research.md/data-model.md não exigem nada mais sofisticado para o MVP).
  perform public.cacheta_reshuffle_if_empty(p_table_id);
  select monte into v_monte from public.cacheta_table_decks where table_id = p_table_id for update;
  if jsonb_array_length(v_monte) = 0 then
    return false; -- nada a comprar, mesa efetivamente travada — não deveria acontecer em condições normais
  end if;

  v_drawn := v_monte -> (jsonb_array_length(v_monte) - 1);
  update public.cacheta_table_decks set monte = v_monte - (jsonb_array_length(v_monte) - 1) where table_id = p_table_id;

  select cards into v_hand from public.cacheta_hands where seat_id = v_seat_id for update;
  v_hand := v_hand || v_drawn;
  update public.cacheta_tables set monte_count = jsonb_array_length(v_monte) - 1 where id = p_table_id;
  insert into public.cacheta_moves (table_id, seat_id, type, card) values (p_table_id, v_seat_id, 'draw_monte', v_drawn);

  -- Descarte: heurística trivial — para cada carta, conta quantas "parceiras"
  -- ela tem na mão (mesmo valor em outra carta, ou mesmo naipe com valor
  -- adjacente); descarta a carta com menos parceiras (a menos útil para
  -- formar trincas/sequências), desempate pela primeira encontrada.
  v_best_idx := 0;
  v_best_score := 999;
  for v_i in 0..(jsonb_array_length(v_hand) - 1) loop
    v_card := v_hand -> v_i;
    v_score := 0;
    for v_discard_idx in 0..(jsonb_array_length(v_hand) - 1) loop
      if v_discard_idx = v_i then continue; end if;
      v_other := v_hand -> v_discard_idx;
      if (v_other->>'rank')::int = (v_card->>'rank')::int then
        v_score := v_score + 1;
      elsif (v_other->>'suit') = (v_card->>'suit')
        and abs((v_other->>'rank')::int - (v_card->>'rank')::int) = 1 then
        v_score := v_score + 1;
      end if;
    end loop;
    if v_score < v_best_score then
      v_best_score := v_score;
      v_best_idx := v_i;
    end if;
  end loop;

  v_card := v_hand -> v_best_idx;
  update public.cacheta_hands set cards = v_hand - v_best_idx where seat_id = v_seat_id;
  update public.cacheta_table_seats set hand_count = 9 where id = v_seat_id;
  update public.cacheta_tables set discard_pile = discard_pile || v_card where id = p_table_id;

  insert into public.cacheta_moves (table_id, seat_id, type, card) values (p_table_id, v_seat_id, 'discard', v_card);

  perform public.cacheta_advance_turn(p_table_id);

  return true;
end;
$$;

revoke all on function public.advance_bot_turn(uuid) from public, anon;
grant execute on function public.advance_bot_turn(uuid) to authenticated;
