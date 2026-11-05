# Implementation Plan: Moedas, Mesas Pagas e Indicação

**Branch**: `002-moedas-pagamento-indicacao` | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-moedas-pagamento-indicacao/spec.md`

## Summary

Adiciona dinheiro real à plataforma pela primeira vez (Fase 5 M1-M3 retomada): uma carteira de moedas
virtuais por jogador identificado, compra de pacotes via Pix com aprovação manual de admin (sem
integração de PSP/banco), mesas pagas no jogo de Cacheta já existente (entrada em moedas, vencedor leva
o pote menos a taxa da casa), um programa de indicação com comissão real sobre essa taxa, e um fluxo de
cadastro melhorado (nick com disponibilidade em tempo real + login Google). Abordagem técnica: ledger
append-only como única fonte de verdade de saldo (sem coluna de saldo cacheada), toda escrita de dinheiro
centralizada em funções `security definer` ou Server Actions service-role (nunca RLS direta), extensão
das RPCs do jogo de Cacheta já existente em vez de uma segunda camada paralela, e um gate explícito
(`players.is_guest`) que bloqueia qualquer jogador convidado de tocar em dinheiro.

## Technical Context

**Language/Version**: TypeScript (Next.js 16, App Router), PL/pgSQL (Postgres via Supabase)

**Primary Dependencies**: `@supabase/supabase-js`/`@supabase/ssr` (já em uso), Supabase Auth (Google
OAuth provider — habilitado via `supabase config push`, mesmo mecanismo já usado para anonymous sign-in),
Supabase Storage (primeiro uso no projeto)

**Storage**: Postgres (Supabase, projeto real linkado, sem Postgres local) + Supabase Storage (bucket
`payment-receipts`, novo)

**Testing**: `tests/rls.test.ts` (Vitest, estendido ao final da fase — convenção já documentada em
`.specify/memory/constitution.md` Princípio V), scripts descartáveis `scripts/_tmp-verify-*.ts` por
marco (ver quickstart.md), `npm run lint` / `npm run build`

**Target Platform**: Web (Vercel), mobile-responsive (mesmo padrão do resto do site)

**Project Type**: Web application (Next.js App Router monolito, sem frontend/backend separados)

**Performance Goals**: Nenhum alvo numérico específico — volume de uso é o de uma plataforma de um único
criador (dezenas a centenas de jogadores simultâneos no pior caso), não um produto de escala massiva;
saldo derivado por soma é aceitável nesse volume (ver research.md §1).

**Constraints**: Confirmação de pagamento é manual (sem webhook/reconciliação bancária — decisão
explícita do usuário); nenhuma tabela de saldo/transação pode ter update direto do jogador via RLS
(Princípio II); todo jogador convidado deve permanecer com acesso total ao jogo gratuito sem nenhuma
regressão.

**Scale/Scope**: 4 user stories (P1–P4), ~8 migrations novas, ~1 bucket de Storage, extensão de 2 RPCs
existentes + 1 Server Action existente, ~7 RPCs novas, novas rotas de UI para compra/aprovação/criação de
mesa paga/indicação/cadastro com Google.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. RLS-First Authorization** — PASS. Toda tabela nova tem RLS habilitada; nenhuma decisão de acesso
  fica só em TypeScript (gate de convidado é um helper SQL, não um `if` no componente).
- **II. No Direct Write on Sensitive Tables** — PASS. `wallet_movements`, `coin_purchase_orders`,
  `referral_codes`, `referral_links` não têm INSERT/UPDATE direta para `anon`/`authenticated` — tudo via
  RPC `security definer` ou a Server Action `baterCombinacao` já existente (service-role após RLS
  confirmar acesso).
- **III. Denormalization Requires a Validation Trigger** — N/A direto: a única denormalização nova é
  `cacheta_tables.entry_amount`, que não é uma referência a outra tabela (não há "conta real" para
  divergir) — não precisa de trigger de validação. `wallet_movements.reference_table_id` é uma FK normal,
  não uma denormalização de dono.
- **IV. Explicit Privilege Revocation** — PASS, com atenção: toda função nova segue
  `revoke all ... from public, anon; grant execute ... to authenticated` explícito (contracts/rpcs.md);
  `platform_settings`/`coin_packages` precisam do padrão correto de revoke de coluna (research.md §7) —
  neste caso a tabela inteira é sensível o bastante para já nascer sem SELECT a `anon`, evitando o
  problema de revoke parcial por completo.
- **V. Verify Against the Real Linked Project** — PASS. quickstart.md define scripts descartáveis por
  marco, extensão de `tests/rls.test.ts` deferida ao fim da fase (convenção já estabelecida).
- **VI. Simplicity Over Speculative Abstraction** — PASS. Confirmação manual de pagamento em vez de
  qualquer integração de PSP (decisão explícita do usuário, não uma abstração especulativa); saldo
  derivado em vez de cacheado; lógica de payout dentro de `baterCombinacao` já existente em vez de um job
  novo; `Server Actions` seguem o shape `ActionState` já convencionado, sem lib de schema nova.

Nenhuma violação identificada — não é necessária a seção de Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-moedas-pagamento-indicacao/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── rpcs.md
└── tasks.md          # gerado por /speckit-tasks
```

### Source Code (repository root)

```text
supabase/migrations/
├── <ts>_players_is_guest.sql
├── <ts>_handle_new_admin_user_provider_guard.sql
├── <ts>_wallet.sql
├── <ts>_coin_packages_and_purchases.sql
├── <ts>_payment_receipts_storage.sql
├── <ts>_platform_settings.sql
├── <ts>_cacheta_paid_tables.sql
└── <ts>_referral_program.sql

lib/
├── actions/
│   ├── player-auth.ts        # estendido: link_or_create_player ganha p_referral_code; novo callback Google
│   ├── wallet.ts             # novo: request_coin_purchase, upload de comprovante
│   ├── admin-wallet.ts       # novo: review_coin_purchase (painel admin)
│   ├── referral.ts           # novo: set_referral_code
│   └── cacheta.ts            # estendido: baterCombinacao ganha payout de mesa paga

app/
├── auth/
│   └── callback/route.ts     # novo: troca código OAuth por sessão, resolve next
├── (player)/
│   ├── jogar/
│   │   ├── entrar/           # estendido: botão Google + verificação de nick em tempo real
│   │   ├── vincular-google/  # novo: escolher nick após primeiro login Google
│   │   ├── online/           # estendido: campo de valor de entrada ao criar mesa
│   │   └── [tableId]/        # estendido: mostra pote/entrada na mesa
│   ├── carteira/              # novo: saldo, pacotes, solicitar compra, status dos pedidos
│   └── indicacao/             # novo: definir código, ver link, ver indicados e comissão acumulada
└── admin/(shell)/
    ├── pagamentos/            # novo: fila de pedidos pendentes, aprovar/rejeitar
    └── configuracoes/         # novo (ou extensão de uma tela já existente): pacotes, taxa, chave Pix

components/
├── wallet/                   # novo: saldo, formulário de compra, upload de comprovante
└── referral/                 # novo: código, link, lista de indicados
```

**Structure Decision**: Mesma estrutura já usada para o jogo de Cacheta (`lib/actions/<domínio>.ts`,
`app/(player)/<rota>`) — domínio novo isolado, sem bolar nada em cima de `lib/actions/cacheta.ts` além do
ponto único (`baterCombinacao`) onde o payout realmente precisa acontecer, e sem reaproveitar
`app/admin/(shell)/[accountId]/...` já que moedas/pagamento são plataforma-wide, não por conta TikTok
(mesmo raciocínio já aplicado a `scoring_rules`/`players`, que também moveram para fora do namespace de
conta).
