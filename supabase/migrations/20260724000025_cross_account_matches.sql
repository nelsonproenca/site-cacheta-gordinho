-- Confrontos between a player on the logged-in streamer's live and a player
-- on a DIFFERENT streamer's live. matches (player_a_id/player_b_id,
-- 20260724000023) can't represent this: it requires a single
-- tiktok_account_id and exactly one of live_session_id/caxetao_event_id
-- (matches_exactly_one_source), so a two-account pairing would have to pick
-- one account as the "owner" — which would also pull it into that account's
-- ranking via matches_set_score_period, exactly what this feature must NOT
-- do (cross-streamer confrontos count in no ranking at all, decided
-- explicitly). A separate table sidesteps that entirely: getRanking/
-- getPeriodRanking (lib/scoring/get-ranking.ts) never read this table, so
-- isolation is structural, not a filter someone could forget to add later.
--
-- This phase only builds the pairing + an optional winner marker — no
-- scoring_rule/points yet, that's a later "match execution" screen.
create table public.cross_account_matches (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.tiktok_accounts (id) on delete cascade,
  live_session_id uuid not null references public.live_sessions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  opponent_account_id uuid not null references public.tiktok_accounts (id) on delete cascade,
  opponent_live_session_id uuid not null references public.live_sessions (id) on delete cascade,
  opponent_player_id uuid not null references public.players (id) on delete cascade,
  winner text check (winner in ('player', 'opponent')),
  created_by uuid not null references public.admins (id),
  created_at timestamptz not null default now(),
  constraint cross_account_matches_distinct_accounts check (account_id <> opponent_account_id),
  constraint cross_account_matches_distinct_players check (player_id <> opponent_player_id)
);

alter table public.cross_account_matches enable row level security;

-- Defense in depth against a manipulated form (same reasoning as
-- matches_validate_account, 20260717000014): account_id/opponent_account_id
-- are denormalized for RLS speed, so verify each actually matches the real
-- account of its live_session_id.
create or replace function public.cross_account_matches_validate()
returns trigger
language plpgsql
as $$
declare
  v_account uuid;
  v_opponent_account uuid;
begin
  select tiktok_account_id into v_account from public.live_sessions where id = new.live_session_id;
  select tiktok_account_id into v_opponent_account from public.live_sessions where id = new.opponent_live_session_id;

  if v_account is null or v_account <> new.account_id then
    raise exception 'cross_account_matches.account_id must match live_session_id''s account';
  end if;
  if v_opponent_account is null or v_opponent_account <> new.opponent_account_id then
    raise exception 'cross_account_matches.opponent_account_id must match opponent_live_session_id''s account';
  end if;

  return new;
end;
$$;

create trigger cross_account_matches_check_accounts
  before insert or update of account_id, live_session_id, opponent_account_id, opponent_live_session_id
  on public.cross_account_matches
  for each row execute function public.cross_account_matches_validate();

-- Both sides of a confronto can see/manage it — it's their player too, not
-- just the creator's business.
create policy "cross_account_matches_select_either_side"
  on public.cross_account_matches
  for select
  using (public.has_account_access(account_id) or public.has_account_access(opponent_account_id));

create policy "cross_account_matches_insert_creator_side"
  on public.cross_account_matches
  for insert
  with check (public.has_account_access(account_id));

create policy "cross_account_matches_update_either_side"
  on public.cross_account_matches
  for update
  using (public.has_account_access(account_id) or public.has_account_access(opponent_account_id))
  with check (public.has_account_access(account_id) or public.has_account_access(opponent_account_id));

create policy "cross_account_matches_delete_either_side"
  on public.cross_account_matches
  for delete
  using (public.has_account_access(account_id) or public.has_account_access(opponent_account_id));
