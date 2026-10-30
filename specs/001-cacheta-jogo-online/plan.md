# Implementation Plan: Jogo de Cacheta jogável (mesa virtual, robôs e online)

**Branch**: `001-cacheta-jogo-online` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-cacheta-jogo-online/spec.md`

## Summary

Adicionar ao site já em produção um jogo de Cacheta genuinamente jogável — mesa virtual,
baralho digital, turnos com compra/descarte/batida — em dois modos (treino contra oponentes
controlados pelo sistema, e online multiplayer em tempo real), sem reaproveitar nem afetar o
domínio existente de pontuação manual de lives (`matches`/`match_results`/`scoring_rules`).
Abordagem técnica: quatro tabelas novas e isoladas (mesa, assento, mão privada, log de
jogadas) com RLS como camada primária de proteção da mão de cada jogador; jogadas simples
(comprar/descartar) via RPC `security definer` resolvendo `current_player_id()`, no mesmo
idioma já usado por `send_live_chat_message`; a validação de "bater" (trincas/quadra/quina/
coringa) isolada num módulo TypeScript puro e testável, acionado por uma Server Action que lê
a mão via cliente RLS do próprio jogador e só então grava com o cliente service-role — o
mesmo idioma de confirmação-depois-privilégio já usado em `endBroadcastManually`; sincronização
em tempo real via `postgres_changes` (já em produção no chat ao vivo), sem introduzir
Presence/Broadcast; timer de turno e avanço de bots seguindo o padrão lazy sem cron já
estabelecido (`closeStaleLiveSessions`/`syncCachetaoEventStatus`).

## Technical Context

**Language/Version**: TypeScript, Next.js 16 (App Router, React 19)

**Primary Dependencies**: `@supabase/ssr`/`@supabase/supabase-js` (já em uso via
`lib/supabase/{client,server,service}.ts`), Tailwind v4 (`app/globals.css` design tokens) —
nenhuma dependência nova a instalar.

**Storage**: Supabase Postgres com RLS, mesmo projeto já linkado (sem Postgres local neste
ambiente).

**Testing**: Vitest para o motor de regras puro (`lib/cacheta/rules.test.ts`), extensão de
`tests/rls.test.ts` (ao final da fase, por preferência já registrada do usuário), scripts
descartáveis contra o projeto Supabase real para verificação ponta a ponta de cada marco
(mesmo padrão de `scripts/smoke-test.ts`).

**Target Platform**: Web app responsivo (Next.js em Vercel) — não um app Android nativo;
assunção já registrada em `docs/prd-jogo-online.md` §6 e no `spec.md`, pendente apenas de
confirmação explícita do usuário caso ele realmente precise de um app de loja no futuro.

**Project Type**: Web app único (App Router) — extensão do projeto existente, não um serviço
separado.

**Performance Goals**: Propagação de uma jogada aos demais participantes de uma mesa em
poucos segundos (spec `SC-002`); UI responsiva durante o timer de turno de 15s sem travar a
interação dos demais assentos.

**Constraints**: Sem infraestrutura de cron/scheduler (toda expiração de turno e avanço de
bot é lazy, disparada pelo próximo cliente que agir/consultar); RLS é a fronteira de
aplicação de regras de privacidade de mão — nunca confiar em validação só no cliente; todo
schema novo verificado contra o projeto Supabase real, nunca contra um Postgres local
inexistente neste ambiente.

**Scale/Scope**: Base de jogadores de um único criador/plataforma — mesas pequenas (poucos
assentos por mesa), volume de partidas simultâneas baixo; não é um requisito de escala tipo
SaaS multi-cliente.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. RLS-First Authorization** — PASS. `cacheta_tables`/`cacheta_table_seats`/`cacheta_moves`
  têm SELECT amplo a quem tem assento na mesa (via RLS, não checagem de app); `cacheta_hands`
  tem SELECT restrito via RLS a `seat.player_id = current_player_id()`. Nenhuma autorização é
  decidida só em TypeScript.
- **II. No Direct Write on Sensitive Tables** — PASS. Nenhuma das 4 tabelas novas tem policy de
  INSERT/UPDATE direta para `anon`/`authenticated`. Jogadas simples passam por RPC
  `security definer`; "bater" passa por Server Action que lê via cliente RLS e escreve via
  `createServiceClient()` só depois de confirmar a posse da mão.
- **III. Denormalization Requires a Validation Trigger** — N/A por desenho: nenhuma coluna de
  conta/dono é denormalizada nas tabelas novas (a autorização usa um join RLS a
  `cacheta_table_seats.player_id`, não uma cópia redundante). Se uma futura otimização de
  performance introduzir uma denormalização (ex. `player_id` direto em `cacheta_hands`), o
  trigger de validação cruzada correspondente deve ser adicionado naquele momento — não
  antecipado aqui sem necessidade real (ver Princípio VI).
- **IV. Explicit Privilege Revocation** — PASS, aplicado no desenho: toda função nova faz
  `revoke all ... from public, anon` antes de `grant execute ... to authenticated`, e cada
  marco de verificação reconfirma isso com uma query real a `information_schema`, não só lendo
  a migration.
- **V. Verify Against the Real Linked Project** — PASS: `quickstart.md` e os marcos abaixo
  assumem scripts descartáveis contra o projeto real; extensão de `tests/rls.test.ts` fica para
  o fim da fase, conforme a preferência já registrada.
- **VI. Simplicity Over Speculative Abstraction** — PASS: sem cron novo (reaproveita o padrão
  lazy já existente), sem Presence/Broadcast novo (reaproveita `postgres_changes` já provado),
  sem biblioteca de validação de formulário nova (Server Actions seguem o `ActionState`
  existente).

Nenhuma violação a justificar — `Complexity Tracking` fica vazio.

## Project Structure

### Documentation (this feature)

```text
specs/001-cacheta-jogo-online/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Projeto único já existente (Next.js App Router) — esta feature estende os diretórios já
estabelecidos, sem criar uma nova árvore paralela:

```text
supabase/migrations/
└── <timestamp>_cacheta_game.sql        # NEW: 4 tabelas + RLS + RPCs de jogada simples

lib/
├── cacheta/
│   ├── rules.ts                        # NEW: motor de regras puro (trincas/quadra/quina/coringa)
│   └── rules.test.ts                   # NEW: testes unitários do motor de regras
├── actions/
│   └── cacheta.ts                      # NEW: Server Actions (baterCombinacao, wrappers de RPC)
└── supabase/
    └── middleware.ts                   # EDIT: adicionar /jogar ao isPlayerProtectedRoute

components/
└── cacheta/
    ├── table-board.tsx                 # NEW: mesa visual
    ├── hand-fan.tsx                    # NEW: mão em leque
    ├── turn-timer.tsx                  # NEW: adaptado de components/closing-countdown.tsx
    └── move-log.tsx                    # NEW: feed de jogadas

app/(player)/jogar/
├── treino/page.tsx                     # NEW: mesa contra robôs (M1)
├── online/page.tsx                     # NEW: lobby online (M2)
└── [tableId]/page.tsx                  # NEW: mesa em andamento (ambos os modos)

tests/
└── rls.test.ts                         # EDIT (fim da fase): novos describe blocks para as 4 tabelas

scripts/
└── <descartável>.ts                    # NEW por marco: verificação ponta a ponta contra o projeto real
```

**Structure Decision**: Extensão in-place do projeto Next.js/Supabase único já existente — sem
app separado, sem pacote novo, sem split frontend/backend. Cada marco (ver `tasks.md` depois de
`/speckit-tasks`) toca um subconjunto coeso desses arquivos, permitindo verificação
independente por marco.

## Complexity Tracking

*(vazio — nenhuma violação de constituição a justificar)*
