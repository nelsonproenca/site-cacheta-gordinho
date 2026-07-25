-- "Tela de execução" for cross_account_matches (20260724000025), deferred
-- when that table was first created: each confronto can now record which
-- scoring_rule applied to its winner. No cascade on scoring_rule_id (same
-- reasoning as match_results.scoring_rule_id — a rule with recorded points
-- must not silently disappear on delete). points_awarded is a snapshot of
-- scoring_rules.points at write time, same as match_results.points_awarded,
-- since rule values can be retuned later. This still never feeds any
-- ranking — cross_account_matches stays isolated by construction, only the
-- win-tally shown alongside these points is new, and that's computed purely
-- from `winner`, not from these two columns.
alter table public.cross_account_matches
  add column scoring_rule_id uuid references public.scoring_rules (id),
  add column points_awarded integer;
