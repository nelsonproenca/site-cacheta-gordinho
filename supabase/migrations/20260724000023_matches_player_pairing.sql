-- Lets a `matches` row represent an actual pairing of two named players
-- ("partida"), for the new /partidas screen (select 2 players from an open
-- live's participants or a closed-registration Caxetão's confirmed
-- registrations). match_results can't hold this on its own: its
-- scoring_rule_id/points_awarded are NOT NULL, so a pairing created before
-- either side has a result yet would have nowhere to record who the two
-- players even are. These two columns exist purely to carry that pairing —
-- match_results (and the ranking math that reads it) is untouched.
--
-- This also incidentally distinguishes new "partidas" from the legacy
-- one-player-per-match rows created by recordMatchResult (lib/actions/lives.ts)
-- — those never set these columns, so a query for "matches with a pairing"
-- naturally excludes every match created before this feature existed,
-- without needing to infer it from match_results counts.
alter table public.matches
  add column player_a_id uuid references public.players (id),
  add column player_b_id uuid references public.players (id);

alter table public.matches
  add constraint matches_pairing_distinct
  check (player_a_id is null or player_b_id is null or player_a_id <> player_b_id);

alter table public.matches
  add constraint matches_pairing_both_or_neither
  check ((player_a_id is null) = (player_b_id is null));
