---
description: "Task list for Jogo de Cacheta jogável (mesa virtual, robôs e online)"
---

# Tasks: Jogo de Cacheta jogável (mesa virtual, robôs e online)

**Input**: Design documents from `specs/001-cacheta-jogo-online/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/rpcs.md`, `quickstart.md`

**Tests**: Incluídos onde a spec/constituição exigem verificação explícita (motor de regras
unitário, extensão de `tests/rls.test.ts`, scripts descartáveis contra o projeto real) — não
TDD estrito para as Server Actions/UI, consistente com a convenção já existente no projeto.

**Organization**: Tarefas agrupadas pelas user stories de `spec.md` (US1 = treino/robôs,
US2 = online, US3 = pontuação/ranking do jogo), cada uma independentemente testável.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: US1, US2 ou US3 — mapeado a `spec.md`

## Path Conventions

Projeto único (Next.js App Router) já existente — caminhos reais do repositório, não
genéricos (ver `plan.md` → Project Structure).

---

## Phase 1: Setup

**Purpose**: Scaffolding de diretórios — nenhuma dependência nova a instalar.

- [X] T001 [P] Criar `lib/cacheta/cards.ts` com os tipos de domínio do baralho (naipe, valor,
      carta) usados por todo o motor de regras e pelas RPCs — baralho tradicional conforme
      `docs/prd-jogo-online.md` §2/§4.
- [X] T002 [P] Criar os diretórios vazios `components/cacheta/` e `app/(player)/jogar/`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, RLS e RPCs compartilhados pelos dois modos de jogo — nenhuma user story
pode começar antes disso.

**⚠️ CRITICAL**: Nenhuma tarefa de user story pode começar até esta fase estar completa.

- [X] T003 Em `supabase/migrations/<timestamp>_cacheta_game.sql`: criar tabela
      `cacheta_tables` exatamente com as colunas de `data-model.md` (`id`, `mode` `'bots' |
      'online'`, `status` `'waiting' | 'playing' | 'finished'`, `max_seats`, `monte_count`,
      `discard_top` jsonb, `vira` jsonb, `coringa` jsonb, `turn_seat_id` FK nullable,
      `turn_deadline_at` nullable, `winner_seat_id` FK nullable, `created_by` FK
      `players.id`, `created_at`); `enable row level security`; policy
      `cacheta_tables_select_seated` (SELECT para quem tem assento na mesa, via subquery em
      `cacheta_table_seats`); **sem** policy de INSERT/UPDATE direta.
- [X] T004 No mesmo arquivo de migration: criar tabela `cacheta_table_seats` (`id`,
      `table_id` FK on delete cascade, `seat_no`, `player_id` FK nullable, `is_bot` boolean
      default `false`, `hand_count` int, `status` `'active' | 'eliminated' | 'batido'`,
      `joined_at`); `check ((player_id is null) = is_bot)`; RLS habilitada; policy
      `cacheta_table_seats_select_seated`; sem write direto.
- [X] T005 No mesmo arquivo: criar tabela `cacheta_hands` (`id`, `table_id` FK on delete
      cascade, `seat_id` FK on delete cascade **unique**, `cards` jsonb); RLS habilitada;
      policy `cacheta_hands_select_own` restrita a `exists (select 1 from
      cacheta_table_seats s where s.id = seat_id and s.player_id = current_player_id())`;
      sem write direto para `anon`/`authenticated`.
- [X] T006 No mesmo arquivo: criar tabela `cacheta_moves` (`id`, `table_id` FK on delete
      cascade, `seat_id` FK on delete cascade, `type` `'draw_monte' | 'draw_discard' |
      'discard' | 'bater' | 'expire'`, `card` jsonb nullable, `created_at`); RLS habilitada;
      policy `cacheta_moves_select_seated`; sem INSERT direto.
- [X] T007 No mesmo arquivo: função `create_cacheta_table(mode text, max_seats int) returns
      uuid`, `security definer`, resolvendo o criador via `current_player_id()` — cria a
      mesa, o assento do criador, e (se `mode = 'bots'`) preenche os demais assentos com
      `is_bot = true` imediatamente (contrato completo em `contracts/rpcs.md`); termina com
      `revoke all ... from public, anon; grant execute ... to authenticated;`.
- [X] T008 No mesmo arquivo: função `start_cacheta_game(table_id uuid) returns void`,
      `security definer` — só o criador pode chamar, distribui 9 cartas por assento em
      `cacheta_hands`, define `vira`/`coringa`/`turn_seat_id`/`turn_deadline_at = now() +
      interval '15 seconds'`, muda `status` para `'playing'`; mesmo padrão de
      revoke/grant.
- [X] T009 No mesmo arquivo: funções `draw_from_monte(table_id uuid) returns jsonb` e
      `draw_from_discard(table_id uuid) returns jsonb`, `security definer` — validam turno
      do chamador via `current_player_id()`, mutam `cacheta_hands`/`monte_count`/
      `discard_top`, inserem `cacheta_moves`; reabastecem o monte embaralhando o descarte
      quando ambos esgotados (regra confirmada em `spec.md` Edge Cases); mesmo padrão de
      revoke/grant.
- [X] T010 No mesmo arquivo: função `discard_card(table_id uuid, card jsonb) returns void`,
      `security definer` — valida turno e posse da carta na mão do chamador, avança
      `turn_seat_id`/`turn_deadline_at`, insere `cacheta_moves`; mesmo padrão de
      revoke/grant.
- [X] T011 No mesmo arquivo: função `expire_turn(table_id uuid) returns void`, `security
      definer`, chamável por qualquer assento da mesa — reconfirma `now() >
      turn_deadline_at` com `for update` antes de agir (idempotente), aplica descarte
      automático padrão (spec Assumptions), insere `cacheta_moves` (`type = 'expire'`),
      avança o turno; mesmo padrão de revoke/grant.
- [X] T012 Rodar `supabase db push` e regenerar `lib/supabase/database.types.ts` via
      `supabase gen types typescript --linked > lib/supabase/database.types.ts`.
- [X] T013 [P] Implementar `lib/cacheta/rules.ts` — motor de regras puro: valida mão de 9
      cartas, batida normal (3 trincas), quadra (sequência de 4 cartas OU trinca com uma
      dobra), quina (sequência de 5 cartas OU trinca com duas dobras), coringa definido
      pela vira (carta seguinte, mesma cor) — assinatura
      `validarBatida(mao: Carta[], jogada: Combinacao): { valid: true; breakdown: ... } | {
      valid: false; reason: string }` (spec `FR-006`).
- [X] T014 [P] Em `lib/supabase/middleware.ts`: adicionar o prefixo `/jogar` à cadeia
      `isPlayerProtectedRoute` (mesmo padrão já usado para `/ao-vivo`/`/minha-conta` —
      nenhum middleware novo).

**Checkpoint**: Schema, RLS e RPCs compartilhadas prontas — as user stories podem começar.

**Nota de implementação**: durante T003–T011 foi necessária uma tabela adicional não
prevista em `data-model.md`, `cacheta_table_decks` (o monte de compra real, sem NENHUMA
policy de SELECT — nem mesmo restrita ao dono — porque conhecer a ordem das cartas
restantes é uma vantagem de jogo injusta para qualquer assento, não uma questão de
"privacidade do dono"; só as RPCs tocam nela via `security definer`). A verificação
ponta a ponta (T024, antecipada aqui para validar o Foundational antes de construir UI em
cima) também encontrou e corrigiu um bug real: a policy `cacheta_table_seats_select_seated`
causava recursão infinita por se autoconsultar dentro do próprio `USING` — corrigido com
a função `cacheta_has_seat_at()` (`security definer`, mesmo padrão de
`has_account_access`), em `20261029000042_cacheta_fix_seats_rls_recursion.sql`. 21/21
checagens passaram após a correção, incluindo a confirmação de que `anon` recebe
`42501 permission denied` (não um no-op mascarado) em todas as funções novas.

---

## Phase 3: User Story 1 - Jogar uma partida completa contra robôs (Priority: P1) 🎯 MVP

**Goal**: Um jogador cria uma mesa de treino, joga uma rodada completa contra oponentes
controlados pelo sistema, do início a um resultado — sem depender de um segundo jogador real.

**Independent Test**: Uma única sessão de jogador cria `/jogar/treino`, joga até bater (ou é
eliminado), vê o resultado.

### Implementação da User Story 1

- [X] T015 [US1] No arquivo de migration de T003–T011: função `advance_bot_turn(table_id
      uuid) returns boolean`, `security definer` — se `turn_seat_id` aponta para um assento
      `is_bot`, executa compra + descarte por heurística simples (carta menos útil à
      formação de trincas/sequências) e avança o turno; retorna `true` se agiu, `false` se
      o turno já não é de um bot; mesmo padrão de revoke/grant.
- [X] T016 [P] [US1] Criar `components/cacheta/table-board.tsx` — mesa oval, avatares,
      monte/descarte/coringa no centro, usando os tokens de `app/globals.css` (não recriar
      cores/fontes do zero), visual inspirado em `docs/tela0.jpeg`.
- [X] T017 [P] [US1] Criar `components/cacheta/hand-fan.tsx` — mão em leque do jogador
      local, com ação de selecionar carta para descarte/batida.
- [X] T018 [P] [US1] Criar `components/cacheta/turn-timer.tsx` adaptando o padrão
      hidration-safe de `components/closing-countdown.tsx` (início em `null`, `setInterval`
      de 1s, cleanup no unmount) para um timer curto de 15s a partir de
      `cacheta_tables.turn_deadline_at`, disparando `expire_turn` ao zerar.
- [X] T019 [P] [US1] Criar `components/cacheta/move-log.tsx` — feed de jogadas a partir de
      `cacheta_moves` (ex. "Bot Cida comprou do monte").
- [X] T020 [US1] Criar `lib/actions/cacheta.ts` com a Server Action `baterCombinacao(tableId,
      formData)`: lê `seat_id`/`cards` do chamador via `createClient()` (RLS garante que só
      a própria mão volta), valida com `lib/cacheta/rules.ts`, e só então usa
      `createServiceClient()` para marcar `cacheta_table_seats.status = 'batido'`,
      `cacheta_tables.status = 'finished'`/`winner_seat_id`, e inserir `cacheta_moves`
      (`type = 'bater'`) — contrato completo em `contracts/rpcs.md`; `ActionState` no
      mesmo formato já usado no resto do projeto.
- [X] T021 [US1] Criar `app/(player)/jogar/treino/page.tsx` — chama `create_cacheta_table`
      com `mode = 'bots'` e redireciona para a mesa criada.
- [X] T022 [US1] Criar `app/(player)/jogar/[tableId]/page.tsx` — monta `table-board`/
      `hand-fan`/`turn-timer`/`move-log`; sincroniza via `postgres_changes` em
      `cacheta_tables`/`cacheta_table_seats`/`cacheta_moves`/a própria `cacheta_hands`
      (fetch inicial + `supabase.channel(...).on("postgres_changes", ...)` + dedupe por id
      + `removeChannel` no cleanup, mesmo padrão de `components/broadcast/live-chat.tsx`);
      após cada jogada bem-sucedida do jogador local, chama `advance_bot_turn` em loop
      enquanto a vez for de um assento `is_bot`.
- [X] T023 [US1] Criar `lib/cacheta/rules.test.ts` (Vitest) cobrindo: batida normal válida/
      inválida, quadra por sequência, quadra por trinca+dobra, quina por sequência, quina
      por trinca+duas dobras, aplicação correta do coringa pela vira.
- [X] T024 [US1] Script descartável de verificação ponta a ponta contra o projeto Supabase
      real (padrão `scripts/smoke-test.ts`), cobrindo o roteiro de `quickstart.md` → M1:
      criação de mesa contra bots, distribuição de 9 cartas, bloqueio de jogada fora de
      turno, `expire_turn` idempotente sob chamada dupla.

**Checkpoint**: A User Story 1 deve estar completa e jogável sozinha neste ponto.

---

## Phase 4: User Story 2 - Jogar uma partida online com outro jogador real (Priority: P2)

**Goal**: Dois ou mais jogadores reais criam/entram na mesma mesa online e completam uma
rodada em tempo real, sem que a mão de um vaze para o outro.

**Independent Test**: Duas contas de jogador, duas sessões, mesma mesa online, rodada
completa — sem envolver nenhum assento de bot.

### Implementação da User Story 2

- [X] T025 [US2] No arquivo de migration de T003–T011/T015: função `join_cacheta_table
      (table_id uuid) returns uuid`, `security definer` — ocupa o próximo `seat_no` livre
      de uma mesa `mode = 'online'` e `status = 'waiting'`; rejeita mesa cheia/já iniciada/
      chamador já sentado; mesmo padrão de revoke/grant.
- [X] T026 [US2] Criar `app/(player)/jogar/online/page.tsx` — lobby: criar mesa online
      (`create_cacheta_table` com `mode = 'online'`), listar mesas abertas do jogador, entrar
      numa mesa existente via `join_cacheta_table`.
- [X] T027 [US2] Em `app/(player)/jogar/[tableId]/page.tsx` (de T022): cobrir o fluxo
      `mode = 'online'` — aguardar assentos mínimos preenchidos antes de `start_cacheta_game`
      poder ser chamado pelo criador, e reutilizar os mesmos componentes/sincronização já
      construídos na User Story 1 (nenhuma duplicação de UI entre os dois modos).
- [X] T028 [US2] Verificação manual ponta a ponta com duas sessões reais, conforme
      `quickstart.md` → M2: confirmar que a mão de um jogador nunca aparece na resposta de
      rede/Realtime do outro, que o estado público propaga em poucos segundos, e que um
      turno ocioso expira corretamente mesmo com dois jogadores reais.

**Checkpoint**: As User Stories 1 e 2 devem funcionar, cada uma de forma independente.

---

## Phase 5: User Story 3 - Acompanhar resultado, pontuação e ranking do jogo (Priority: P3)

**Goal**: Ao final de uma partida, o jogador vê o resultado e pode consultar um ranking deste
jogo, estruturalmente separado do ranking de pontuação manual de lives.

**Independent Test**: Após pelo menos uma partida concluída (treino ou online), abrir a tela
de ranking do jogo e ver o resultado refletido.

### Implementação da User Story 3

- [X] T029 [US3] Em `supabase/migrations/<timestamp>_cacheta_game_results.sql`: criar tabela
      `cacheta_game_results` (`id`, `table_id` FK **unique**, `winner_player_id` FK
      nullable, `combination_type` `'batida_normal' | 'quadra' | 'quina'`,
      `points_awarded` int, `created_at`); RLS habilitada; policy de SELECT pública (spec
      `FR-013`); sem write direto — só a Server Action de T030.
- [X] T030 [US3] Estender `baterCombinacao` (`lib/actions/cacheta.ts`, de T020) para também
      inserir `cacheta_game_results` (vencedor, `combination_type`, `points_awarded`) na
      mesma operação de escrita via `createServiceClient()`.
- [X] T031 [US3] Criar `app/(player)/jogar/ranking/page.tsx` — lista jogadores ordenados por
      pontuação agregada de `cacheta_game_results`, com um rótulo visualmente distinto do
      ranking de pontuação manual de lives já existente no site (spec `SC-006`).
- [X] T032 [US3] Confirmar, lendo `lib/scoring/get-ranking.ts`, que nenhuma consulta dali foi
      alterada por esta feature — o ranking de lives continua ignorando por completo as
      tabelas `cacheta_*` (regressão explícita, não assumida).

**Checkpoint**: As três user stories devem estar funcionalmente completas e independentes.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Qualidade e verificação final — não bloqueia nenhuma user story individual.

- [X] T033 [P] Estender `tests/rls.test.ts` com um `describe` por tabela nova
      (`cacheta_tables`, `cacheta_table_seats`, `cacheta_hands`, `cacheta_moves`,
      `cacheta_game_results`), seguindo o padrão existente (fixtures via cliente
      service-role, asserções de capacidade negativa entre jogadores/mesas — em especial:
      um jogador não pode ler a mão de outro). Feito ao final da fase, não a cada migration
      (preferência já registrada do usuário, constituição Princípio V).
- [X] T034 Rodar `npm run lint` e `npm run build` limpos.
- [X] T035 Executar a verificação de segurança de `quickstart.md` (query a
      `information_schema.routine_privileges` confirmando que nenhuma função `cacheta_*`
      ficou executável por `anon`).
- [X] T036 [P] Storybook para os componentes apresentacionais de `components/cacheta/`
      (`table-board`, `hand-fan`, `turn-timer`, `move-log`) — excluindo qualquer componente
      que importe `baterCombinacao`/Server Action diretamente, mesma exclusão já aplicada ao
      resto do projeto (Vite/Storybook não roda o compilador RSC que faz `"use server"`
      funcionar).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup — **bloqueia** todas as user stories.
- **User Story 1 (Phase 3)**: depende só do Foundational.
- **User Story 2 (Phase 4)**: depende do Foundational; reutiliza componentes/página de mesa
  construídos na US1 (T022/T027), mas é testável e entregável mesmo que a US1 ainda não
  tenha sido "finalizada" no sentido de polimento — a dependência é de código compartilhado,
  não de aceite funcional.
- **User Story 3 (Phase 5)**: depende do Foundational e da existência de `baterCombinacao`
  (T020, da US1) para estender — não depende da US2.
- **Polish (Phase 6)**: depende de todas as user stories desejadas estarem completas.

### Parallel Opportunities

- T001/T002 (Setup) em paralelo.
- T013/T014 (fim do Foundational) em paralelo entre si e com T012, mas não com T003–T011
  (mesmo arquivo de migration, sequencial).
- T016–T019 (componentes de UI da US1) em paralelo entre si.
- T033/T036 (Polish) em paralelo entre si.

---

## Parallel Example: User Story 1

```bash
# Após o Foundational completo, em paralelo:
Task: "Criar components/cacheta/table-board.tsx"
Task: "Criar components/cacheta/hand-fan.tsx"
Task: "Criar components/cacheta/turn-timer.tsx"
Task: "Criar components/cacheta/move-log.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Phase 1 (Setup) e Phase 2 (Foundational — bloqueia tudo).
2. Completar Phase 3 (US1): mesa jogável contra robôs numa única aba.
3. **Parar e validar** com `quickstart.md` → M1 antes de prosseguir.
4. Esse ponto já é demonstrável: motor de regras completo, mesa visual, resultado de
   partida — sem depender de nenhuma peça de tempo real entre dois jogadores.

### Incremental Delivery

1. Setup + Foundational → base pronta.
2. US1 → validar independentemente → demonstrável (MVP).
3. US2 → validar independentemente com duas sessões reais → multiplayer em tempo real
   entregue.
4. US3 → validar independentemente → pontuação/ranking do jogo entregues, sem tocar no
   ranking de lives existente.
5. Polish → testes de RLS, lint/build, Storybook.
