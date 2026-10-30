# Data Model: Jogo de Cacheta jogável

Quatro tabelas novas, isoladas do domínio existente (`matches`/`match_results`/
`scoring_rules` não são lidas nem escritas por nenhuma delas — ver constituição, Technology
Constraints). Convenção do repositório: `create table public.<nome> (...)`, `enable row
level security` logo em seguida, policies nomeadas `<table>_<verbo>_<descritor>`.

## `cacheta_tables`

Uma mesa/partida — estado público compartilhado por todos os assentos.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | `gen_random_uuid()` |
| `mode` | text | `'bots' \| 'online'` |
| `status` | text | `'waiting' \| 'playing' \| 'finished'` |
| `max_seats` | int | nº de assentos da mesa |
| `monte_count` | int | cartas restantes no monte de compra |
| `discard_top` | jsonb | carta no topo do descarte (null se vazio) |
| `vira` | jsonb | carta "vira" da rodada |
| `coringa` | jsonb | carta coringa derivada da vira (mesma cor, valor seguinte) |
| `turn_seat_id` | uuid, FK → `cacheta_table_seats.id`, nullable | assento da vez |
| `turn_deadline_at` | timestamptz, nullable | prazo do turno corrente (ver `research.md` §5) |
| `winner_seat_id` | uuid, FK → `cacheta_table_seats.id`, nullable | preenchido ao bater |
| `created_by` | uuid, FK → `players.id` | quem criou a mesa |
| `created_at` | timestamptz | `now()` |

**RLS**: SELECT para quem tem assento na mesa (`exists (select 1 from
cacheta_table_seats s where s.table_id = id and s.player_id = current_player_id())`). Sem
policy de INSERT/UPDATE direta — só via RPCs (`create_cacheta_table`, `start_cacheta_game`,
e as próprias RPCs de jogada, que avançam `turn_seat_id`/`turn_deadline_at`).

**Validações/transições de estado**: `waiting → playing` (via `start_cacheta_game`, exige
assentos mínimos preenchidos) → `playing → finished` (ao bater, ou ao todos os demais
assentos serem eliminados).

## `cacheta_table_seats`

Um assento por participante (humano ou bot).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `table_id` | uuid, FK → `cacheta_tables.id` on delete cascade | |
| `seat_no` | int | posição na mesa (ordem de turno) |
| `player_id` | uuid, FK → `players.id`, nullable | null quando `is_bot = true` |
| `is_bot` | boolean | default `false` |
| `hand_count` | int | contagem pública de cartas (não o conteúdo) |
| `status` | text | `'active' \| 'eliminated' \| 'batido'` |
| `joined_at` | timestamptz | `now()` |

**RLS**: SELECT para quem tem assento na mesma mesa (mesmo padrão acima, auto-referência via
`table_id`). Sem write direto — só via RPCs.

**Constraint**: `check ((player_id is null) = is_bot)` — um assento é bot xor tem jogador.

## `cacheta_hands`

A mão real de um assento — **a única tabela genuinamente privada** deste domínio.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `table_id` | uuid, FK → `cacheta_tables.id` on delete cascade | |
| `seat_id` | uuid, FK → `cacheta_table_seats.id` on delete cascade, unique | 1:1 com o assento |
| `cards` | jsonb | array de cartas (`{ naipe, valor }[]`) |

**RLS**: SELECT restrito — `using (exists (select 1 from cacheta_table_seats s where s.id =
seat_id and s.player_id = current_player_id()))`. Sem policy de write para
`anon`/`authenticated` — só RPCs (`draw_from_monte`, `draw_from_discard`, `discard_card`) e
a Server Action de bater (via `createServiceClient()`), todas resolvendo a identidade do
chamador via `current_player_id()` antes de tocar a linha.

## `cacheta_moves`

Log append-only de jogadas — histórico/feed da partida, trilha de auditoria.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `table_id` | uuid, FK → `cacheta_tables.id` on delete cascade | |
| `seat_id` | uuid, FK → `cacheta_table_seats.id` on delete cascade | |
| `type` | text | `'draw_monte' \| 'draw_discard' \| 'discard' \| 'bater' \| 'expire'` |
| `card` | jsonb, nullable | carta envolvida, quando aplicável |
| `created_at` | timestamptz | `now()` |

**RLS**: SELECT para quem tem assento na mesa (mesmo padrão de `cacheta_tables`). Sem
INSERT direto — só pelas RPCs/Server Action que também mutam o estado da jogada, na mesma
transação lógica.

## `cacheta_game_results` (Fase/marco M4 — pontuação e ranking do jogo, US3)

Resultado consolidado de uma mesa concluída — separado de `match_results` por desenho.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `table_id` | uuid, FK → `cacheta_tables.id`, unique | 1:1 com a mesa |
| `winner_player_id` | uuid, FK → `players.id`, nullable | null se encerrada sem vencedor |
| `combination_type` | text | `'batida_normal' \| 'quadra' \| 'quina'` — modo 7 pontos fica fora até ser detalhado (spec `FR-011`) |
| `points_awarded` | int | pontuação da rodada, snapshot — mesmo raciocínio de `match_results.points_awarded` nunca ser recalculado retroativamente |
| `created_at` | timestamptz | `now()` |

**RLS**: SELECT público (alimenta o ranking do jogo, spec `FR-013`); sem write direto — só
gravado pela mesma Server Action que resolve a batida.

## Relação entre entidades

```text
cacheta_tables (1) ──< cacheta_table_seats (N) ──( 1:1 )── cacheta_hands
      │                        │
      │                        └──< cacheta_moves (N)
      │
      └──( 1:1, ao concluir )── cacheta_game_results
```

Nenhuma FK cruza para `matches`, `match_results`, `scoring_rules`, `tiktok_accounts` ou
`admin_account_access` — o único ponto de contato com o domínio existente é `players.id`
(identidade de jogador já estabelecida pela Fase 5 M0), lido, nunca escrito, por este
domínio.
