# Contratos: RPCs e Server Actions

Convenção: toda RPC abaixo é `security definer set search_path = public`, resolve a identidade do
chamador via `current_player_id()`/`auth.uid()` (nunca recebe um `player_id` do cliente), e termina com
`revoke all ... from public, anon; grant execute ... to authenticated;` explícito (Princípio IV). Erros
são `raise exception` em inglês simples, traduzidos só na camada de UI (mesmo padrão de
`ERROR_TRANSLATIONS` em `components/cacheta/table-board.tsx`).

## Identidade

### `is_handle_available(p_handle text) returns boolean`
`stable`, sem `security definer`. Normaliza `p_handle` como `normalize_tiktok_handle()` já faz e checa
inexistência em `players.tiktok_handle`. `grant execute to anon, authenticated`.

### `link_or_create_player_by_email(p_handle text, p_display_name text, p_referral_code text default null) returns uuid`
Requer `auth.uid() is not null` e `raw_app_meta_data->>'provider' = 'google'` (defense in depth, só
usável por uma sessão realmente originada de Google). Mesmo comportamento de claim-by-handle de
`link_or_create_player`. Se `p_referral_code` informado e resolver para um jogador diferente do que está
sendo criado, insere `referral_links`; se o código não existir ou resolver para o próprio chamador, a
chamada falha? Não — silenciosamente ignora o código inválido e segue criando a conta (um código
digitado errado não deve impedir o cadastro), só bloqueia explicitamente a autoindicação via o `check`
constraint do banco.

### `link_or_create_player(p_handle text, p_display_name text, p_referral_code text default null) returns uuid`
(Extensão da RPC existente — telefone/OTP.) Mesmo parâmetro novo opcional e mesmo comportamento de
indicação acima.

## Carteira

### `request_coin_purchase(p_package_id uuid, p_receipt_path text) returns uuid`
Exige `not current_player_is_guest()`. Lê `coin_packages` pelo id (deve estar `active`), grava
`coin_purchase_orders` com os campos snapshot, status `pending`. Retorna o id do pedido (usado pela UI
para montar o path de upload antes de gravar, ou o upload acontece primeiro para um path previsível
`{player_id}/{uuid gerado no client}` e o id do pedido é esse mesmo uuid — decisão de implementação na
fase de tasks).

### `review_coin_purchase(p_order_id uuid, p_approve boolean, p_rejection_reason text default null) returns void`
Exige `is_approved_admin()`. Lock de linha no pedido (`for update`), exige `status = 'pending'` (idempotência
— Edge Case "admin aprova duas vezes"). Se `p_approve`: insere `wallet_movements` (`reason =
'coin_purchase'`, `amount = coin_amount` do pedido) e marca `status = 'approved'`. Senão: marca
`status = 'rejected'` com o motivo, sem inserir movimento nenhum.

## Mesas pagas (extensão do domínio `specs/001-cacheta-jogo-online/`)

### `create_cacheta_table(p_mode text, p_max_seats int, p_entry_amount int default 0) returns uuid`
Novo parâmetro opcional, retrocompatível. Quando `p_entry_amount > 0`: exige `p_mode = 'online'`, exige
`not current_player_is_guest()`, e — após criar a mesa e o assento do criador como já acontece hoje —
debita `p_entry_amount` do criador (mesmo lock-and-check de `wallet_movements`, `reason = 'table_entry'`,
`reference_table_id` = a mesa recém-criada). Se o saldo for insuficiente, a função inteira falha (a mesa
não chega a ser criada).

### `join_cacheta_table(p_table_id uuid) returns uuid`
Mesma assinatura. Quando a mesa tem `entry_amount > 0`: exige `not current_player_is_guest()` e debita
`entry_amount` do jogador entrando, mesmo padrão de movimento acima, antes de criar o assento — se o
saldo for insuficiente, a função falha sem criar o assento.

### `cancel_cacheta_table(p_table_id uuid) returns void`
Nova. Exige que o chamador seja `created_by` da mesa e `status = 'waiting'`. Estorna (`reason =
'table_refund'`) a entrada de cada assento humano já sentado, marca `status = 'cancelled'`.

### `baterCombinacao` (Server Action, `lib/actions/cacheta.ts` — não SQL)
Extensão da função existente. Depois de marcar a mesa como `finished` com vencedor (já acontece hoje),
se `entry_amount > 0`:
1. `pote = entry_amount * count(assentos com player_id não nulo)`.
2. Lê `platform_settings` para `house_rake_percent`/`referral_commission_percent`.
3. `taxa = round(pote * house_rake_percent / 100)`.
4. Credita `pote - taxa` ao vencedor (`reason = 'table_payout'`).
5. Registra a taxa (`reason = 'house_rake'`, `player_id = null`).
6. Se o vencedor tem `referral_links` com `created_at` dentro de 12 meses: credita
   `round(taxa * referral_commission_percent / 100)` ao `referrer_player_id` (`reason =
   'referral_commission'`), saído da taxa já registrada no passo 5 (não é um valor extra).

Tudo isso roda com `createServiceClient()`, já usado nessa função — mesmo padrão de "confirma acesso no
cliente RLS, escreve com service-role".

## Indicação

### `set_referral_code(p_code text) returns void`
Exige `not current_player_is_guest()` e que o chamador ainda não tenha um `referral_codes` (sem policy de
update — uma vez definido, é definitivo, FR-013).

## Storage

### Bucket `payment-receipts`
Privado. Policies de `storage.objects` (não SQL de tabela comum):
- INSERT/SELECT: `(storage.foldername(name))[1] = current_player_id()::text` — jogador só mexe na sua
  própria pasta.
- SELECT adicional: `is_approved_admin()` — admin lê qualquer comprovante para revisar.
- Sem UPDATE/DELETE para ninguém além do dono do objeto original (jogador reenviando um comprovante
  novo gera um path novo, não sobrescreve).
