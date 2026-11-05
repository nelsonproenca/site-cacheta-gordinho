# Data Model: Moedas, Mesas Pagas e Indicação

Domínio novo e isolado (mesmo princípio do jogo de Cacheta em `specs/001-cacheta-jogo-online/`): nenhuma
tabela daqui tem FK para `matches`/`match_results`/`scoring_rules`. O único ponto de contato com o resto
da plataforma é `players.id`, só lido. Extensão pontual em `cacheta_tables` (já existente) para carregar
o valor de entrada da mesa.

## Tabelas novas

### `players` (alteração)

- `+ is_guest boolean not null default false` — ver research.md §2. Setado só por
  `link_or_create_guest_player`.

### `wallet_accounts`

Uma linha por jogador identificado, existe só para servir de ponto de lock de concorrência (ver
research.md §1) — não guarda saldo algum.

- `player_id uuid primary key references players(id)`
- `created_at timestamptz not null default now()`

Criada sob demanda (upsert) na primeira operação de carteira de cada jogador, não no cadastro — evita uma
linha morta para jogadores que nunca compram nada.

### `wallet_movements`

Ledger append-only, única fonte de verdade de saldo.

- `id uuid primary key default gen_random_uuid()`
- `player_id uuid references players(id)` — **nullable**: uma linha de `reason = 'house_rake'` não tem
  dono.
- `amount int not null` — positivo (crédito) ou negativo (débito); nunca zero (`check (amount != 0)`).
- `reason text not null check (reason in ('coin_purchase', 'table_entry', 'table_payout', 'table_refund', 'house_rake', 'referral_commission'))`
- `reference_table_id uuid references cacheta_tables(id)` — nullable, preenchido para
  `table_entry`/`table_payout`/`table_refund`/`house_rake`/`referral_commission`.
- `reference_purchase_id uuid references coin_purchase_orders(id)` — nullable, preenchido só para
  `coin_purchase`.
- `created_at timestamptz not null default now()`

Saldo de um jogador = `coalesce(sum(amount), 0) from wallet_movements where player_id = :id`. Sem
política de insert/update/delete direta para `anon`/`authenticated` — todo movimento nasce dentro de uma
função `security definer` (Princípio II). SELECT: jogador vê só os próprios movimentos
(`player_id = current_player_id()`); admin aprovado vê todos (para auditoria/suporte).

### `coin_packages`

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `price_brl numeric(10,2) not null check (price_brl > 0)`
- `coin_amount int not null check (coin_amount > 0)`
- `active boolean not null default true`
- `sort_order int not null default 0`
- `created_at timestamptz not null default now()`

SELECT: `active = true` é público para jogador identificado (`current_player_is_identified()`), qualquer
linha para admin aprovado. INSERT/UPDATE/DELETE: só `is_super_admin()` (mesmo padrão de `scoring_rules`).

### `coin_purchase_orders`

- `id uuid primary key default gen_random_uuid()`
- `player_id uuid not null references players(id)`
- `package_id uuid not null references coin_packages(id)`
- `coin_amount int not null` — snapshot do pacote no momento do pedido (mesmo raciocínio de
  `match_results.points_awarded` ser um snapshot — o admin pode mudar o pacote depois sem afetar pedidos
  já abertos).
- `price_brl numeric(10,2) not null` — snapshot.
- `receipt_path text not null` — path do objeto no bucket `payment-receipts`.
- `status text not null default 'pending' check (status in ('pending', 'approved', 'rejected'))`
- `reviewed_by uuid references admins(id)`
- `reviewed_at timestamptz`
- `rejection_reason text`
- `created_at timestamptz not null default now()`

Sem política de insert direta (criado via RPC `request_coin_purchase`, resolve `current_player_id()`
server-side e exige `not current_player_is_guest()`). UPDATE (aprovar/rejeitar) só por admin aprovado, via
RPC `review_coin_purchase` (não um update RLS direto — aprovar precisa *também* inserir o
`wallet_movements` de crédito atomicamente, então é escrita composta, mesmo funil do Princípio II).
SELECT: o próprio jogador dono, ou qualquer admin aprovado.

### `platform_settings`

Linha única (ver research.md §7).

- `id boolean primary key default true check (id)`
- `house_rake_percent numeric(5,2) not null default 10 check (house_rake_percent between 0 and 100)`
- `referral_commission_percent numeric(5,2) not null default 25 check (referral_commission_percent between 0 and 100)`
- `pix_key text`
- `pix_key_owner_name text`
- `updated_at timestamptz not null default now()`

SELECT: `current_player_is_identified() or is_approved_admin()`. UPDATE: só `is_super_admin()`. Sem
DELETE/INSERT depois do seed inicial (uma migration insere a única linha).

### `referral_codes`

- `player_id uuid primary key references players(id)`
- `code text not null unique` — normalizado (maiúsculas, sem espaço), mesmo espírito de
  `normalize_tiktok_handle`.
- `created_at timestamptz not null default now()`

Uma linha por jogador, nunca atualizável depois de criada (sem policy de UPDATE — mesmo padrão de
`partidas` serem imutáveis após o insert). INSERT via RPC `set_referral_code(p_code)`, exige
`not current_player_is_guest()`. SELECT pública (o link `site.com/?ref=CODIGO` precisa resolver o código
para alguém que ainda nem tem conta).

### `referral_links`

- `referred_player_id uuid primary key references players(id)` — cada jogador só pode ter **um**
  indicador (o primeiro vínculo é definitivo, nunca re-atribuído).
- `referrer_player_id uuid not null references players(id)`
- `created_at timestamptz not null default now()` — início da janela de 12 meses (FR-017).
- `check (referred_player_id != referrer_player_id)` — bloqueia autoindicação (FR-015) também no banco,
  não só na RPC.

Criado via a mesma RPC que materializa a conta identificada (`link_or_create_player_by_email` e a versão
por telefone, estendidas para aceitar um `p_referral_code` opcional) — vincula no mesmo instante em que a
conta nasce, nunca depois. Sem policy de UPDATE/DELETE. SELECT: o próprio indicado, o próprio indicador,
ou admin.

## Alteração em `cacheta_tables` (domínio existente, `specs/001-cacheta-jogo-online/`)

- `+ entry_amount int not null default 0 check (entry_amount >= 0)`
- `+ check (entry_amount = 0 or mode = 'online')` — mesa paga só no modo online (research.md §6).
- `status` ganha o valor `'cancelled'` na check constraint existente (`waiting`, `playing`, `finished`,
  `cancelled`).

## Relação entre entidades

```text
players (is_guest) ──┬── wallet_accounts (1:1, lock-only)
                      ├── wallet_movements (1:N, nullable player_id para house_rake)
                      ├── coin_purchase_orders (1:N)
                      ├── referral_codes (1:1, opcional)
                      └── referral_links (1:1 como indicado, 1:N como indicador)

coin_packages ── coin_purchase_orders (snapshot no pedido)

cacheta_tables (entry_amount) ── wallet_movements (reference_table_id: entry/payout/refund/house_rake/referral_commission)

platform_settings ── linha única, lida por create_cacheta_table/baterCombinacao para resolver percentuais no momento do cálculo
```

## Novas migrations previstas (nomes para a fase de tasks)

1. `..._players_is_guest.sql` — coluna + redefine `link_or_create_guest_player`.
2. `..._handle_new_admin_user_provider_guard.sql` — guarda extra no trigger (research.md §3).
3. `..._wallet.sql` — `wallet_accounts`, `wallet_movements`, `current_player_is_guest`,
   `current_player_is_identified`, `is_handle_available`.
4. `..._coin_packages_and_purchases.sql` — `coin_packages`, `coin_purchase_orders`,
   `request_coin_purchase`, `review_coin_purchase`.
5. `..._payment_receipts_storage.sql` — bucket + policies de `storage.objects`.
6. `..._platform_settings.sql` — tabela + seed da linha única.
7. `..._cacheta_paid_tables.sql` — `cacheta_tables.entry_amount`/`status cancelled`, estende
   `create_cacheta_table`/`join_cacheta_table`, nova `cancel_cacheta_table`.
8. `..._referral_program.sql` — `referral_codes`, `referral_links`, `set_referral_code`, estende
   `link_or_create_player`/`link_or_create_guest_player` (bloqueando convidado) e nova
   `link_or_create_player_by_email`.
