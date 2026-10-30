# Contracts: RPCs `security definer` (chamadas via `supabase.rpc(...)` do cliente)

Todas resolvem o chamador via `current_player_id()` (nunca um `player_id`/`seat_id` recebido
como argumento sem validar contra ela) e terminam em `revoke all ... from public, anon;
grant execute ... to authenticated;` (Princípio IV da constituição).

## `create_cacheta_table(mode text, max_seats int) returns uuid`

Cria uma `cacheta_tables` em `status = 'waiting'` e um `cacheta_table_seats` para o chamador
(`seat_no = 0`). Se `mode = 'bots'`, preenche os demais `max_seats - 1` assentos com
`is_bot = true` imediatamente. Retorna o `id` da mesa criada.

**Erros**: rejeita `max_seats` fora de um intervalo razoável (ex. 2–6); rejeita se o
chamador já tiver uma mesa própria em `status != 'finished'` (spec, Assumptions: um jogador
por mesa ativa).

## `join_cacheta_table(table_id uuid) returns uuid`

Ocupa o próximo `seat_no` livre de uma mesa `mode = 'online'` e `status = 'waiting'`.
Retorna o `id` do assento criado.

**Erros**: mesa não encontrada, mesa cheia, mesa não está mais em `waiting`, chamador já tem
assento nesta mesa.

## `start_cacheta_game(table_id uuid) returns void`

Só o criador da mesa pode chamar. Exige assentos mínimos preenchidos. Embaralha e distribui
9 cartas por assento (grava em `cacheta_hands`), define `vira`/`coringa`, define
`turn_seat_id` (primeiro assento) e `turn_deadline_at = now() + interval '15 seconds'`,
muda `status` para `'playing'`.

**Erros**: chamador não é o criador, mesa já iniciada, assentos insuficientes.

## `draw_from_monte(table_id uuid) returns jsonb` / `draw_from_discard(table_id uuid) returns jsonb`

Valida que o chamador ocupa `turn_seat_id` da mesa. Move uma carta do monte (ou o topo do
descarte) para `cacheta_hands.cards` do assento do chamador, decrementa `monte_count` (ou
limpa `discard_top` para a próxima carta visível), insere `cacheta_moves`. Retorna a carta
comprada.

**Erros**: não é a vez do chamador, monte vazio e descarte vazio simultaneamente
(reabastece o monte embaralhando o descarte primeiro — ver `research.md`/spec Edge Cases),
chamador já comprou neste turno (uma compra por turno).

## `discard_card(table_id uuid, card jsonb) returns void`

Valida turno do chamador e que `card` está de fato em `cacheta_hands.cards` do assento.
Remove a carta da mão, define como `discard_top`, insere `cacheta_moves`, avança
`turn_seat_id` para o próximo assento ativo e redefine `turn_deadline_at`.

**Erros**: não é a vez do chamador, carta não pertence à mão, chamador ainda não comprou
neste turno.

## `expire_turn(table_id uuid) returns void`

Chamável por **qualquer** assento da mesa (não só o da vez). Reconfirma `now() >
turn_deadline_at` com `for update` antes de agir (idempotente — uma segunda chamada após a
primeira já ter avançado o turno é um no-op silencioso, não um erro). Aplica o
comportamento padrão de expiração (descartar automaticamente uma carta da mão do jogador da
vez, sem comprar — spec Assumptions), insere `cacheta_moves` com `type = 'expire'`, avança
o turno.

## `advance_bot_turn(table_id uuid) returns boolean`

Chamado em loop pelo cliente enquanto `turn_seat_id` apontar para um assento `is_bot`.
Executa uma jogada válida simples (compra + descarte por heurística trivial — carta menos
útil à formação de trincas/sequências) em nome do bot, avança o turno. Retorna `true` se
agiu (e o cliente deve chamar de novo para o próximo bot em sequência), `false` se o turno
já não é de um bot (sinal de parada do loop).

---

# Contract: Server Action — `baterCombinacao`

Não é uma RPC de banco — é uma Server Action (`lib/actions/cacheta.ts`) que implementa o
idioma "confirma acesso no cliente RLS, escreve com service-role" (ver `research.md` §3).

```text
baterCombinacao(tableId: string, formData: FormData) => Promise<ActionState>
```

1. Lê o `seat_id` e `cards` do chamador via o cliente por-requisição (`createClient()`) —
   RLS garante que só a própria mão é retornada; se vier vazio, o chamador não tem assento
   nesta mesa ou não é sua vez.
2. Valida a combinação proposta com `lib/cacheta/rules.ts` contra a mão lida (não contra o
   que o cliente alega ter — a mão vem do banco, a "jogada proposta" é só quais cartas
   formam qual grupo).
3. Se inválida: retorna `{ error: "<motivo pt-BR>" }` sem tocar o banco.
4. Se válida: usa `createServiceClient()` para, numa única operação lógica: marcar
   `cacheta_table_seats.status = 'batido'`, `cacheta_tables.status = 'finished'` e
   `winner_seat_id`, inserir `cacheta_moves` (`type = 'bater'`), inserir
   `cacheta_game_results` com `combination_type`/`points_awarded`.
5. `revalidatePath` da página da mesa; retorna `{ success: "..." }`.

**Erros**: combinação inválida (motivo específico: trincas insuficientes, dobra inválida,
coringa mal aplicado), chamador sem assento/mão nesta mesa, mesa já encerrada.
