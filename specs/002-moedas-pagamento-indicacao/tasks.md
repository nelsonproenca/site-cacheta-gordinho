---
description: "Task list for Moedas, Mesas Pagas e Indicação"
---

# Tasks: Moedas, Mesas Pagas e Indicação

**Input**: Design documents from `specs/002-moedas-pagamento-indicacao/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/rpcs.md`, `quickstart.md`

**Tests**: Scripts descartáveis contra o projeto Supabase real por marco (ver `quickstart.md`), não TDD
estrito nem suíte formal por tarefa — mesma convenção já usada em `specs/001-cacheta-jogo-online/`.
Extensão de `tests/rls.test.ts` deferida para a Polish final (Princípio V / convenção "defer tests to
phase end").

**Organization**: Tarefas agrupadas pelas user stories de `spec.md` (US1 = carteira/compra de moedas,
US2 = mesas pagas, US3 = indicação, US4 = nick em tempo real + Google), cada uma independentemente
testável e entregável.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: US1, US2, US3 ou US4 — mapeado a `spec.md`

## Path Conventions

Projeto único (Next.js App Router) já existente — caminhos reais do repositório, não genéricos (ver
`plan.md` → Project Structure).

---

## Phase 1: Setup

**Purpose**: Nenhuma dependência nova a instalar — Google OAuth e Storage já são capacidades nativas do
Supabase já usado no projeto.

- [X] T001 [P] Criar os diretórios vazios `lib/actions/wallet.ts`, `lib/actions/admin-wallet.ts`,
      `lib/actions/referral.ts`, `components/wallet/`, `components/referral/`.
- [X] T002 Habilitar o provider Google no Supabase Auth via `supabase config push` (seção
      `[auth.external.google]` em `supabase/config.toml`, `enabled = true`, `client_id`/`secret` como
      env vars) — requer que o usuário já tenha um OAuth Client ID/Secret do Google Cloud Console; se
      não tiver, pausar esta tarefa e pedir ao usuário antes de prosseguir (não é algo que o agente pode
      gerar sozinho).
- [X] T003 Criar o bucket de Storage `payment-receipts` (privado) via `supabase storage` (migration SQL
      com `insert into storage.buckets` ou `supabase/config.toml`, conforme o que a versão do Supabase
      CLI linkada suportar).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Gate de convidado, ledger de carteira, trigger de admin — toda user story depende disto.

**⚠️ CRITICAL**: Nenhuma tarefa de user story pode começar até esta fase estar completa.

- [X] T004 Em `supabase/migrations/<timestamp>_players_is_guest.sql`: `alter table players add column
      is_guest boolean not null default false`; `create or replace function
      link_or_create_guest_player` (já existente) setando `is_guest = true` no insert novo.
- [X] T005 Em `supabase/migrations/<timestamp>_handle_new_admin_user_provider_guard.sql`: `create or
      replace function handle_new_admin_user` adicionando a condição `or coalesce(new.raw_app_meta_data
      ->> 'provider', 'email') != 'email'` ao guard existente (research.md §3) — preservar as duas
      condições já existentes (`actor_type != 'admin'` e `email is null`).
- [X] T006 Em `supabase/migrations/<timestamp>_wallet.sql`: criar `wallet_accounts` (`player_id` PK FK
      `players`, `created_at`), RLS habilitada, sem nenhuma policy (só funções `security definer`
      tocam nela, mesmo padrão de `cacheta_table_decks`).
- [X] T007 No mesmo arquivo: criar `wallet_movements` exatamente com as colunas de `data-model.md`
      (`player_id` nullable, `amount` com `check (amount != 0)`, `reason` com o check de valores
      permitidos, `reference_table_id`, `reference_purchase_id`, `created_at`); RLS habilitada; policy
      `wallet_movements_select_own_or_admin` (`player_id = current_player_id() or is_approved_admin()`);
      sem policy de INSERT/UPDATE/DELETE direta.
- [X] T008 No mesmo arquivo: função `current_player_is_guest() returns boolean`, `security definer
      stable`, resolvendo `current_player_id()` e lendo `players.is_guest`; retorna `true` também
      quando não há jogador logado (fail-closed). Função `current_player_is_identified() returns
      boolean` = `not current_player_is_guest()`.
- [X] T009 [P] No mesmo arquivo: função `is_handle_available(p_handle text) returns boolean`, `stable`
      (sem `security definer`), normalizando `p_handle` como `normalize_tiktok_handle()` já faz;
      `grant execute to anon, authenticated`.
- [X] T010 No mesmo arquivo: função auxiliar `wallet_credit(p_player_id uuid, p_amount int, p_reason
      text, p_reference_table_id uuid default null, p_reference_purchase_id uuid default null) returns
      void`, `security definer` — adquire lock (`select ... for update` em `wallet_accounts`, fazendo
      upsert da linha se não existir), insere o movimento. Função auxiliar `wallet_debit(...)` igual,
      mas calculando o saldo atual (`sum(amount)`) sob o mesmo lock e levantando exceção
      `'insufficient balance'` se `saldo < p_amount`. Ambas reaproveitadas por todas as RPCs das fases
      seguintes — não duplicar esta lógica de lock em cada RPC que debita/credita.
- [X] T011 Rodar `supabase db push`; rodar `supabase gen types typescript --linked >
      lib/supabase/database.types.ts`.
- [X] T012 Script descartável `scripts/_tmp-verify-wallet-foundation.ts`: confirma
      `current_player_is_guest()` retorna `true` para convidado e `false` para identificado,
      `is_handle_available` funciona para handle livre/ocupado, `wallet_credit`/`wallet_debit` mantêm o
      saldo correto sob chamadas concorrentes simuladas (duas chamadas de débito em paralelo contra o
      mesmo saldo pequeno — confirma que só uma ganha o lock e a outra falha por saldo insuficiente, sem
      saldo negativo). Apagar o script ao final.

**Checkpoint**: Fundação pronta — as quatro user stories podem começar.

---

## Phase 3: User Story 1 - Comprar moedas com Pix e confirmação manual (Priority: P1) 🎯 MVP

**Goal**: Jogador identificado compra um pacote de moedas, envia comprovante, admin aprova/rejeita, saldo
reflete corretamente.

**Independent Test**: Ver `quickstart.md` M1.

### Implementation for User Story 1

- [X] T013 [P] [US1] Em `supabase/migrations/<timestamp>_coin_packages_and_purchases.sql`: criar
      `coin_packages` (data-model.md); RLS habilitada; policy `coin_packages_select_identified`
      (`active and current_player_is_identified()` ou `is_approved_admin()` vê tudo); INSERT/UPDATE/
      DELETE só `is_super_admin()`.
- [X] T014 [US1] No mesmo arquivo: criar `coin_purchase_orders` (data-model.md); RLS habilitada; policy
      `coin_purchase_orders_select_own_or_admin`; sem INSERT/UPDATE direta.
- [X] T015 [US1] No mesmo arquivo: função `request_coin_purchase(p_package_id uuid, p_receipt_path
      text) returns uuid`, `security definer` — exige `not current_player_is_guest()`, lê o pacote
      (`active = true`, senão falha), grava snapshot (`coin_amount`, `price_brl`), `status = 'pending'`.
- [X] T016 [US1] No mesmo arquivo: função `review_coin_purchase(p_order_id uuid, p_approve boolean,
      p_rejection_reason text default null) returns void`, `security definer` — exige
      `is_approved_admin()`, lock de linha (`for update`), exige `status = 'pending'`; se aprovar, chama
      `wallet_credit` (`reason = 'coin_purchase'`, `reference_purchase_id`) e marca `status =
      'approved'`, `reviewed_by`, `reviewed_at`; se rejeitar, só muda `status`/`rejection_reason`.
- [X] T017 [P] [US1] Em `supabase/migrations/<timestamp>_payment_receipts_storage.sql`: policies de
      `storage.objects` para o bucket `payment-receipts` (contracts/rpcs.md § Storage) — INSERT/SELECT
      pelo próprio jogador (path prefixado por `current_player_id()`), SELECT adicional para
      `is_approved_admin()`.
- [X] T018 [P] [US1] Em `supabase/migrations/<timestamp>_platform_settings.sql`: criar
      `platform_settings` (data-model.md), RLS habilitada, policy de SELECT
      (`current_player_is_identified() or is_approved_admin()`), UPDATE só `is_super_admin()`, seed da
      única linha (`insert into platform_settings (id) values (true)`).
- [X] T019 [US1] Rodar `supabase db push`; regenerar `database.types.ts`.
- [X] T020 [P] [US1] `lib/actions/wallet.ts`: Server Action `requestCoinPurchase(formData)` — recebe
      `packageId` e o arquivo do comprovante, sobe para `payment-receipts/{player_id}/{uuid}.{ext}` via
      o cliente do próprio jogador (não service-role — upload é RLS-gated por path), chama a RPC
      `request_coin_purchase`, `revalidatePath("/jogar/carteira")`. Shape `ActionState` já convencionado.
- [X] T021 [P] [US1] `lib/actions/admin-wallet.ts`: Server Action `reviewCoinPurchase(formData)` —
      chama `review_coin_purchase`, `revalidatePath("/admin/pagamentos")`.
- [X] T022 [US1] `app/(player)/carteira/page.tsx`: saldo atual (soma de `wallet_movements` do jogador),
      lista de `coin_packages` ativos, histórico de `coin_purchase_orders` do jogador com status;
      redireciona convidado para `/jogar/entrar` (mesmo padrão de `TreinoPage`).
- [X] T023 [P] [US1] `components/wallet/purchase-package-modal.tsx`: escolhe pacote, mostra chave Pix/
      valor (lidos de `platform_settings`), upload de comprovante, chama `requestCoinPurchase` —
      reaproveita `components/ui/modal.tsx` já existente.
- [X] T024 [US1] `app/admin/(shell)/pagamentos/page.tsx`: fila de `coin_purchase_orders` com
      `status = 'pending'` (qualquer admin aprovado), link/preview do comprovante (via URL assinada de
      Storage), botões aprovar/rejeitar chamando `reviewCoinPurchase`.
- [X] T025 [US1] `app/admin/(shell)/configuracoes/page.tsx` (ou nome equivalente): CRUD de
      `coin_packages` e edição de `platform_settings` (taxa da casa, comissão, chave Pix), visível só
      para `is_super_admin()` (mesmo padrão de `scoring_rules`).
- [X] T026 [US1] Adicionar o link "Carteira" ao masthead/menu do jogador (`components/account-menu.tsx`
      ou equivalente) e ao sidenav admin (`app/admin/(shell)/layout.tsx`) os itens "Pagamentos"/
      "Configurações".
- [X] T027 [US1] Script descartável `scripts/_tmp-verify-coin-purchase.ts` cobrindo `quickstart.md` M1
      (passos 3–7) contra o projeto real. Apagar ao final.
- [X] T028 [US1] `npm run lint` / `npm run build` limpos.

**Checkpoint**: US1 funcional e testável sozinha — jogador compra moedas, admin aprova/rejeita, saldo
correto.

---

## Phase 4: User Story 2 - Criar e jogar mesas pagas de Cacheta (Priority: P2)

**Goal**: Mesa de Cacheta online com valor de entrada em moedas; vencedor leva o pote menos a taxa da
casa; mesa cancelada estorna sem taxa.

**Independent Test**: Ver `quickstart.md` M2.

### Implementation for User Story 2

- [X] T029 [US2] Em `supabase/migrations/<timestamp>_cacheta_paid_tables.sql`: `alter table
      cacheta_tables add column entry_amount int not null default 0 check (entry_amount >= 0)`,
      `add constraint cacheta_tables_entry_online_only check (entry_amount = 0 or mode = 'online')`,
      e redefinir a `check` de `status` para incluir `'cancelled'`.
- [X] T030 [US2] No mesmo arquivo: `create or replace function create_cacheta_table(p_mode text,
      p_max_seats int, p_entry_amount int default 0) returns uuid` — preserva todo o comportamento já
      existente; quando `p_entry_amount > 0`, exige `p_mode = 'online'` e
      `not current_player_is_guest()`, e debita a entrada do criador via `wallet_debit` (`reason =
      'table_entry'`, `reference_table_id`) depois de criar a mesa/assento, dentro da mesma transação.
- [X] T031 [US2] No mesmo arquivo: `create or replace function join_cacheta_table(p_table_id uuid)
      returns uuid` — preserva comportamento existente; quando a mesa tem `entry_amount > 0`, exige
      `not current_player_is_guest()` e debita a entrada do jogador entrando antes de criar o assento.
- [X] T032 [US2] No mesmo arquivo: nova função `cancel_cacheta_table(p_table_id uuid) returns void` —
      exige `created_by = current_player_id()` e `status = 'waiting'`; para cada assento humano, chama
      `wallet_credit` (`reason = 'table_refund'`); marca `status = 'cancelled'`.
- [X] T033 [US2] Rodar `supabase db push`; regenerar `database.types.ts`.
- [X] T034 [US2] `lib/actions/cacheta.ts`: estender `baterCombinacao` — depois de marcar a mesa
      `finished` com vencedor, se `entry_amount > 0`: lê `platform_settings`, calcula pote/taxa/payout
      (contracts/rpcs.md), chama `wallet_credit` para o vencedor (`reason = 'table_payout'`) e para a
      taxa (`reason = 'house_rake'`, `player_id null`) usando `createServiceClient()` (já em uso nessa
      função).
- [X] T035 [US2] `lib/actions/cacheta.ts`: nova Server Action `cancelPaidTable(tableId)` chamando
      `cancel_cacheta_table`, `revalidatePath`/`redirect` para o lobby.
- [X] T036 [P] [US2] `app/(player)/jogar/online/page.tsx`: campo opcional "valor de entrada (moedas)" no
      formulário de criar mesa (`createOnlineTable` em `lib/actions/cacheta.ts` ganha o parâmetro),
      mostrando o saldo atual do jogador ao lado.
- [X] T037 [P] [US2] `app/(player)/jogar/[tableId]/page.tsx` / `components/cacheta/table-board.tsx`:
      exibe o valor de entrada e o pote esperado quando `entry_amount > 0`; botão "Cancelar mesa"
      (só para o criador, só em `status = 'waiting'`) chamando `cancelPaidTable`.
- [X] T038 [US2] Script descartável `scripts/_tmp-verify-paid-tables.ts` cobrindo `quickstart.md` M2.
      Apagar ao final.
- [X] T039 [US2] `npm run lint` / `npm run build` limpos; confirmar manualmente que uma mesa com
      `entry_amount = 0` (treino e online gratuito, inclusive para convidado) continua funcionando sem
      nenhuma mudança de comportamento.

**Checkpoint**: US1 + US2 funcionais juntas — mesas pagas funcionam de ponta a ponta.

---

## Phase 5: User Story 3 - Indicar jogadores e ganhar comissão (Priority: P3)

**Goal**: Código/link de indicação, vínculo permanente na criação da conta, comissão real sobre a taxa da
casa gerada pelo indicado, por 12 meses.

**Independent Test**: Ver `quickstart.md` M3.

### Implementation for User Story 3

- [X] T040 [US3] Em `supabase/migrations/<timestamp>_referral_program.sql`: criar `referral_codes`
      (data-model.md), RLS habilitada, policy de SELECT pública (`using (true)`), sem policy de
      INSERT/UPDATE direta.
- [X] T041 [US3] No mesmo arquivo: criar `referral_links` (data-model.md, com o `check` de
      autoindicação), RLS habilitada, policy de SELECT para indicado/indicador/admin, sem INSERT/UPDATE
      direta.
- [X] T042 [US3] No mesmo arquivo: função `set_referral_code(p_code text) returns void` — exige
      `not current_player_is_guest()` e ausência de linha prévia em `referral_codes` para o chamador.
- [X] T043 [US3] No mesmo arquivo: `create or replace function link_or_create_player(p_handle text,
      p_display_name text, p_referral_code text default null) returns uuid` — preserva o comportamento
      existente (telefone); se `p_referral_code` resolver para um `referral_codes` válido cujo dono não
      seja o próprio jogador sendo criado/vinculado, insere `referral_links` (ignora silenciosamente
      código inválido/autoindicação em vez de falhar o cadastro inteiro — ver contracts/rpcs.md).
- [X] T044 [US3] No mesmo arquivo: nova função `link_or_create_player_by_email(p_handle text,
      p_display_name text, p_referral_code text default null) returns uuid` — mesmo corpo de
      `link_or_create_player`, mas resolvendo e-mail via `auth.jwt()` em vez de telefone, exigindo
      `raw_app_meta_data ->> 'provider' = 'google'`.
- [X] T045 [US3] Rodar `supabase db push`; regenerar `database.types.ts`.
- [X] T046 [US3] `lib/actions/cacheta.ts`: estender o cálculo de payout em `baterCombinacao` — depois de
      creditar `house_rake`, consulta `referral_links` pelo `winner_player_id` com `created_at` dentro
      de 12 meses; se existir, chama `wallet_credit` para o `referrer_player_id` (`reason =
      'referral_commission'`, valor = `taxa * referral_commission_percent / 100` arredondado).
- [X] T047 [P] [US3] `lib/actions/referral.ts`: Server Action `setReferralCode(formData)` chamando
      `set_referral_code`, `revalidatePath("/jogar/indicacao")`.
- [X] T048 [US3] `app/(player)/indicacao/page.tsx`: definir código (se ainda não tiver), mostrar o link
      gerado, listar indicados (`referral_links` onde `referrer_player_id = eu`) e comissão acumulada
      (soma de `wallet_movements` com `reason = 'referral_commission'`); redireciona convidado.
- [X] T049 [US3] `app/(player)/jogar/entrar/page.tsx` (e a futura tela de Google, US4): ler `?ref=CODIGO`
      da querystring e repassar como `p_referral_code` nas chamadas de `link_or_create_player*`.
- [X] T050 [US3] Script descartável `scripts/_tmp-verify-referral.ts` cobrindo `quickstart.md` M3.
      Apagar ao final.
- [X] T051 [US3] `npm run lint` / `npm run build` limpos.

**Checkpoint**: US1 + US2 + US3 funcionais juntas.

---

## Phase 6: User Story 4 - Cadastro/login melhorado com nick e Google (Priority: P4)

**Goal**: Verificação de nick em tempo real no cadastro; login/cadastro via Google como alternativa ao
telefone, nunca criando uma linha em `admins`.

**Independent Test**: Ver `quickstart.md` M4. Independente das outras três — só depende da Fase 2
(Foundational).

### Implementation for User Story 4

- [X] T052 [P] [US4] `app/auth/callback/route.ts`: Route Handler que troca o código OAuth por sessão
      (`supabase.auth.exchangeCodeForSession`) e redireciona para `next` (query param) — se o jogador
      ainda não tiver `players` vinculado (`current_player_id()` nulo), redireciona para
      `/jogar/vincular-google` em vez do `next` original, preservando `next` como novo query param.
- [X] T053 [P] [US4] `app/(player)/jogar/vincular-google/page.tsx` + client component: formulário de
      nick (reaproveitando a verificação de disponibilidade de T054) + nome de exibição, chama
      `link_or_create_player_by_email` (via nova Server Action em `lib/actions/player-auth.ts`), depois
      redireciona ao `next` preservado.
- [X] T054 [P] [US4] `components/ui/nick-availability-input.tsx`: client component reutilizável — input
      de texto com debounce (~400ms) chamando `supabase.rpc("is_handle_available", { p_handle })`
      direto do client, mostrando disponível/indisponível.
- [X] T055 [US4] `app/(player)/jogar/entrar/page.tsx` / `guest-login-form.tsx`: adicionar botão
      "Continuar com Google" (`supabase.auth.signInWithOAuth({ provider: "google", options: {
      redirectTo: ... } })`) ao lado do fluxo de convidado já existente; usar
      `nick-availability-input` onde já existe captura de nome/nick identificado.
- [X] T056 [US4] Script descartável `scripts/_tmp-verify-nick-availability.ts` cobrindo
      `quickstart.md` M4 passo 2 (a verificação manual do fluxo Google em si, passos 3–4, é feita à mão
      em `npm run dev` — não scriptável sem um fluxo OAuth real). Apagar ao final.
- [X] T057 [US4] `npm run lint` / `npm run build` limpos.

**Checkpoint**: Todas as quatro user stories funcionais e independentemente testáveis.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cobertura de RLS, verificação de privilégios ao vivo, higiene final — convenção do projeto
de deferir isso para o fim da fase (Princípio V, `.specify/memory/constitution.md`).

- [X] T058 Estender `tests/rls.test.ts`: jogador não lê `wallet_movements`/`coin_purchase_orders` de
      outro jogador; convidado não lê `platform_settings`/`coin_packages` nem chama nenhuma RPC de
      dinheiro (`request_coin_purchase`, `set_referral_code`, `create_cacheta_table` com entrada > 0);
      admin não-aprovado não chama `review_coin_purchase`; não-super-admin não escreve em
      `coin_packages`/`platform_settings`.
- [X] T059 Verificar ao vivo (`information_schema.routine_privileges`/`column_privileges`, não só o
      texto da migration) que toda função nova tem o revoke/grant correto e que `anon` não executa
      nenhuma RPC de escrita de dinheiro (Princípio IV).
- [X] T060 Verificar ao vivo as policies de `storage.objects` do bucket `payment-receipts` — um jogador
      de teste não consegue ler/escrever a pasta de outro.
- [X] T061 Rodar `quickstart.md` M1–M4 de ponta a ponta contra o projeto real numa sessão só (depois de
      todas as migrations aplicadas), confirmando que nada de uma fase anterior regrediu.
- [X] T062 `npm run lint` / `npm run build` finais; revisar que todo script `_tmp-verify-*.ts` criado ao
      longo da implementação foi apagado (convenção do projeto).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências, mas T002 (Google OAuth) pode bloquear em espera de credenciais
  do usuário — não impede US1/US2/US3 de prosseguir, só US4.
- **Foundational (Phase 2)**: depende de Setup — BLOQUEIA todas as user stories.
- **US1 (Phase 3)**: depende só de Foundational.
- **US2 (Phase 4)**: depende de Foundational **e** de US1 estar completa (precisa de saldo existente
  para debitar entrada — `wallet_credit`/`wallet_debit` de T010 são compartilhados, mas o fluxo de
  compra real de US1 é o jeito natural de testar US2 com saldo real).
- **US3 (Phase 5)**: depende de Foundational **e** de US2 completa (comissão é sobre a taxa de uma mesa
  paga — não há taxa sem US2 funcionando).
- **US4 (Phase 6)**: depende só de Foundational — pode rodar em paralelo a US1/US2/US3 a qualquer
  momento.
- **Polish (Phase 7)**: depende de todas as user stories desejadas estarem completas.

### Parallel Opportunities

- T001/T003 (Setup) em paralelo; T002 pode esperar.
- T009 (Foundational) é paralela ao restante da Fase 2 dentro do mesmo arquivo de migration (arquivo
  compartilhado, mas sem dependência de ordem entre essa função e as outras do mesmo arquivo).
- T013/T017/T018 (US1) em paralelo (arquivos de migration diferentes).
- T020/T021/T023 (US1) em paralelo (arquivos diferentes).
- T036/T037 (US2) em paralelo.
- T047 (US3) em paralelo ao resto da Fase 5 depois de T042 estar pronta.
- T052/T053/T054 (US4) em paralelo entre si.
- US4 inteira pode ser desenvolvida em paralelo a US1/US2/US3 por não depender delas.

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Setup + Foundational.
2. Completar US1 (Phase 3).
3. Validar com `quickstart.md` M1.
4. Esse ponto já entrega valor real: jogadores compram moedas e admins aprovam — mesmo sem mesa paga
   ainda existir para gastar o saldo.

### Incremental Delivery

Setup + Foundational → US1 (compra de moedas) → US2 (mesas pagas, consome o saldo) → US3 (indicação,
consome a taxa que US2 passou a gerar) → US4 (cadastro melhorado, a qualquer momento em paralelo).
