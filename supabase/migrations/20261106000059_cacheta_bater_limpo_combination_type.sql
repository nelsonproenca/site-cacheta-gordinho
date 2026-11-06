-- lib/cacheta/rules.ts was aligned with the official Cacheta rules
-- (.claude/skills/regras-cacheta/SKILL.md): a 9-card hand only ever splits
-- 3+3+3 ("batida_normal"), and the engine's own "quadra"/"quina" 2-group
-- split (4+5) was never official — removed. In its place, "bater com 10
-- cartas"/"bater limpo" (10 cards, no discard, worth double) is now
-- supported, labeled 'bater_limpo'. 'quadra'/'quina' are kept in the check
-- constraint (not dropped) so historical cacheta_game_results rows written
-- before this migration remain valid — the application simply never writes
-- those two values again.
alter table public.cacheta_game_results drop constraint cacheta_game_results_combination_type_check;
alter table public.cacheta_game_results add constraint cacheta_game_results_combination_type_check
  check (combination_type in ('batida_normal', 'quadra', 'quina', 'bater_limpo'));
