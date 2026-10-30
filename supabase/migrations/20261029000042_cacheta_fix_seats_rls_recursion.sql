-- Fix found by the Foundational verification script (specs/001-cacheta-jogo-online):
-- "cacheta_table_seats_select_seated" queried cacheta_table_seats from
-- inside its own USING clause ("does the caller have ANY seat at this
-- table"), and Postgres re-applies RLS to that inner query too — direct
-- self-recursion ("infinite recursion detected in policy for relation
-- cacheta_table_seats"). It also broke every other policy that joins
-- through cacheta_table_seats (cacheta_tables, cacheta_moves,
-- cacheta_hands), since their subqueries hit the same recursive policy
-- indirectly. Same fix already used for has_account_access/
-- current_player_id: move the self-join into a security definer function,
-- which runs as the function owner and bypasses RLS internally (tables here
-- are not created with FORCE ROW LEVEL SECURITY, so the owner — effectively
-- this function — is exempt), breaking the recursive policy evaluation.

create or replace function public.cacheta_has_seat_at(p_table_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.cacheta_table_seats
    where table_id = p_table_id and player_id = public.current_player_id()
  );
$$;

revoke all on function public.cacheta_has_seat_at(uuid) from public, anon;
grant execute on function public.cacheta_has_seat_at(uuid) to authenticated;

drop policy "cacheta_tables_select_seated" on public.cacheta_tables;
create policy "cacheta_tables_select_seated"
  on public.cacheta_tables
  for select
  using (public.cacheta_has_seat_at(id));

drop policy "cacheta_table_seats_select_seated" on public.cacheta_table_seats;
create policy "cacheta_table_seats_select_seated"
  on public.cacheta_table_seats
  for select
  using (public.cacheta_has_seat_at(table_id));

drop policy "cacheta_moves_select_seated" on public.cacheta_moves;
create policy "cacheta_moves_select_seated"
  on public.cacheta_moves
  for select
  using (public.cacheta_has_seat_at(table_id));
