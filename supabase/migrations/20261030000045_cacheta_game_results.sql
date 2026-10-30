-- Fase 6, US3 (specs/001-cacheta-jogo-online): pontuação/ranking do jogo de
-- Cacheta — separado por desenho de match_results (nenhuma FK cruza para
-- lá, ver data-model.md "Relação entre entidades"). A única escrita é a
-- Server Action baterCombinacao (lib/actions/cacheta.ts), que já grava o
-- restante do resultado de uma batida via createServiceClient() — por isso
-- nenhuma policy de insert/update direta aqui, mesmo padrão de
-- cacheta_moves/cacheta_hands.
create table public.cacheta_game_results (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null unique references public.cacheta_tables (id),
  winner_player_id uuid references public.players (id),
  combination_type text not null check (combination_type in ('batida_normal', 'quadra', 'quina')),
  points_awarded int not null,
  created_at timestamptz not null default now()
);

alter table public.cacheta_game_results enable row level security;

-- SELECT pública (spec FR-013: alimenta o ranking do jogo, visível sem
-- login, mesmo padrão de scoring_rules/cacheta_game_results não ser
-- informação sensível ao contrário da mão/monte deste mesmo domínio).
create policy "cacheta_game_results_select_public"
  on public.cacheta_game_results
  for select
  using (true);
