# Research: Moedas, Mesas Pagas e Indicação

## 1. Saldo de carteira: coluna cacheada vs. soma derivada

**Decision**: Saldo nunca é armazenado — é sempre `sum(amount)` sobre um ledger append-only
`wallet_movements`. Para evitar corrida entre dois débitos simultâneos, toda função que debita (entrada
em mesa, aprovação de compra como crédito não compete por saldo mas por idempotência) primeiro adquire
um lock de linha (`select ... for update`) numa tabela `wallet_accounts` de uma linha por jogador (só
existe para servir de ponto de lock — não guarda saldo nenhum), soma os movimentos existentes, confere
se o saldo é suficiente, e só então insere o novo movimento — tudo dentro da mesma função `security
definer`, portanto na mesma transação.

**Rationale**: Uma coluna de saldo cacheada precisaria ser mantida em sincronia com o ledger em todo
ponto de escrita — qualquer bug futuro (um `update` esquecido, uma função nova que insere um movimento
sem atualizar a coluna) causa drift silencioso entre "o que a carteira diz" e "o que realmente
aconteceu", que é exatamente o tipo de bug mais caro de detectar quando envolve dinheiro. Derivar sempre
do ledger torna essa classe de bug estruturalmente impossível: não existem dois lugares para
desincronizar. O volume de movimentos por jogador neste produto (compras ocasionais, poucas mesas pagas
por dia) é baixo o suficiente para que somar a cada leitura não seja um problema de performance real —
indo ao encontro do Princípio VI da constituição (não otimizar para uma escala que o projeto não tem).

**Alternatives considered**: Coluna `balance` atualizada atomicamente a cada movimento, dentro da mesma
transação do ledger — rejeitada por introduzir uma segunda fonte de verdade sem necessidade real neste
volume de uso, e por ser exatamente o tipo de "abstração que resolve um problema que o projeto não tem"
que o Princípio VI pede para evitar.

## 2. Distinguir jogador convidado de jogador identificado

**Decision**: Nova coluna explícita `players.is_guest boolean not null default false`, setada `true`
apenas dentro de `link_or_create_guest_player` (já existente) no momento da criação da linha, e nunca
derivada de nenhum campo de `auth.users` em tempo de leitura. Um novo helper `current_player_is_guest()`
(`security definer`, mesmo padrão de `current_player_id()`) lê essa coluna para o jogador atual e é usado
como gate em toda função/RPC sensível a dinheiro.

**Rationale**: O projeto já documentou (gotcha de `handle_new_admin_user`, Fase 5 M0) que depender de
`auth.users.is_anonymous` é frágil porque sua disponibilidade varia por versão do Supabase/GoTrue —
mesmo raciocínio se aplica aqui. Uma coluna própria em `players`, setada explicitamente no único lugar
que cria um jogador convidado, é auditável, não depende de internals do GoTrue, e segue o mesmo padrão
já usado para `admins.user_type`/`admins.is_super_admin` (um discriminador de papel como coluna
explícita, não inferido).

**Alternatives considered**: Checar `auth.users.is_anonymous` diretamente — rejeitada pelo motivo acima.
Inferir pelo prefixo `'guest-'` do handle — rejeitada por ser uma string mágica frágil (um admin poderia
em tese cadastrar manualmente um jogador real com handle começando por `guest-`).

## 3. Distinguir cadastro de admin vs. cadastro de jogador via Google OAuth

**Decision**: `handle_new_admin_user()` (trigger em `auth.users`) ganha mais uma condição independente de
skip: também pula o insert em `admins` quando `coalesce(new.raw_app_meta_data->>'provider', 'email') !=
'email'`. Login de admin só existe via e-mail/senha (`/admin/login`, confirmado em CLAUDE.md); Google
OAuth e telefone (OTP) nunca são usados por admins neste projeto — então qualquer `auth.users` row cujo
provider não seja `'email'` nunca deveria virar um `admins`. Depois do OAuth completar, uma nova rota de
callback (`app/auth/callback/route.ts`) troca o código pela sessão e redireciona para uma tela de
"escolher nick" (se o jogador ainda não tiver um `players` row vinculado), que chama uma nova RPC
`link_or_create_player_by_email(p_handle, p_display_name)` — mesmo padrão de `link_or_create_player`
(telefone) e `link_or_create_guest_player`, mas resolvendo e-mail via `auth.jwt()` em vez de telefone.

**Rationale**: `raw_app_meta_data->>'provider'` é populado pelo próprio GoTrue a partir do método de auth
realmente usado — não é metadata que o cliente envia e pode forjar (ao contrário de
`raw_user_meta_data->>'actor_type'`, que é client-supplied e já é usado para o caso telefone/anônimo).
Usar um sinal server-side-confiável para esta nova distinção é mais robusto que tentar empurrar
`actor_type` por um fluxo de redirect OAuth, que não garante controle sobre a metadata inicial da mesma
forma que `signInWithOtp`/`signInAnonymously` garantem.

**Alternatives considered**: Tentar passar `options.data.actor_type` em `signInWithOAuth` — rejeitada por
incerteza sobre se essa opção realmente popula `raw_user_meta_data` no fluxo de redirect OAuth desta
versão do Supabase (comportamento não documentado com confiança suficiente para apostar uma guarda de
segurança nisso); o sinal de `provider` é a opção verificável.

## 4. Upload de comprovante de pagamento

**Decision**: Novo bucket do Supabase Storage, `payment-receipts`, privado (não público). Caminho de
cada arquivo: `{player_id}/{purchase_order_id}.{ext}`. Políticas de Storage (`storage.objects`): um
jogador só lê/escreve objetos cujo primeiro segmento do path seja o seu próprio `current_player_id()`
(na criação do pedido); qualquer admin aprovado lê qualquer objeto do bucket (para revisar o
comprovante), sem política de escrita para admin (eles nunca sobem arquivo, só leem). Upload acontece
direto do client Supabase (já autenticado) para o Storage, sem passar pelo Next.js server — é o padrão
recomendado do Supabase para upload de arquivo.

**Rationale**: Este é o primeiro uso de Supabase Storage no projeto; path prefixado pelo `player_id`
replica, em Storage, o mesmo padrão de RLS por dono já usado nas tabelas (`current_player_id()` no
predicado), sem precisar inventar um mecanismo novo de autorização.

**Alternatives considered**: Base64 inline numa coluna `text`/`bytea` da tabela de pedidos — rejeitada
por não ser o uso pretendido do Postgres para arquivos binários e por tornar a tabela de pedidos pesada
sem necessidade, quando o Storage já resolve isso de forma nativa no Supabase.

## 5. Verificação de nick em tempo real

**Decision**: Nova função `is_handle_available(p_handle text) returns boolean`, `stable` (não
`security definer` — não precisa, é uma leitura pública de uma coluna já publicamente legível via
`players_select_public`), que normaliza o handle do mesmo jeito que o trigger
`normalize_tiktok_handle()` já normaliza antes de gravar, e retorna `not exists (select 1 from players
where tiktok_handle = <normalizado>)`. Chamada via `supabase.rpc()` direto do client component com
debounce (~400ms), sem Server Action.

**Rationale**: `players.tiktok_handle` já é a coluna de handle único existente (confirmado lendo
`20260715000004_players.sql`) — não precisa de uma coluna nova para "nick". Uma função `stable` de
leitura simples, sem necessidade de resolver identidade do chamador, é mais barata e mais direta que uma
Server Action completa a cada tecla digitada — alinhado ao Princípio VI (não adicionar uma camada que o
problema não pede).

**Alternatives considered**: Checar unicidade só no submit do formulário (comportamento já existente,
implícito em qualquer unique constraint) — rejeitada porque a spec (FR-019) exige feedback *antes* do
envio, não depois de um erro.

## 6. Onde vive a lógica de mesa paga (entrada, estorno, pagamento do pote)

**Decision**: Estende as RPCs/Server Actions já existentes do jogo de Cacheta, em vez de criar uma
segunda camada paralela:

- `create_cacheta_table(p_mode, p_max_seats, p_entry_amount default 0)` — novo parâmetro opcional
  (compatível com as duas chamadas existentes, que não o passam). Quando `p_entry_amount > 0`: exige
  `not current_player_is_guest()`, exige `p_mode = 'online'` (mesa paga contra robôs não faz sentido — a
  casa não "paga" o pote de um bot), debita a entrada do criador como parte da mesma transação que cria
  a mesa e o assento dele.
- `join_cacheta_table(p_table_id)` — ao sentar numa mesa com `entry_amount > 0`, debita a entrada do
  jogador que está entrando, com o mesmo gate de convidado.
- `cacheta_tables.entry_amount int not null default 0` e `cacheta_tables.status` ganha um quarto valor,
  `'cancelled'`, para a mesa paga que o criador cancela antes de encher (edge case da spec: estorno sem
  taxa da casa).
- Nova RPC `cancel_cacheta_table(p_table_id)` — só o criador, só enquanto `status = 'waiting'`, estorna a
  entrada de todo assento humano já sentado e marca `status = 'cancelled'`.
- `baterCombinacao` (Server Action já existente, `lib/actions/cacheta.ts`) ganha a lógica de pote: quando
  a mesa que acabou de ser batida tem `entry_amount > 0`, calcula `pote = entry_amount * (nº de assentos
  com player_id não nulo)`, `taxa = round(pote * house_rake_percent / 100)`, credita
  `pote - taxa` ao vencedor, registra a taxa como um movimento sem jogador dono (`player_id null`,
  motivo `'house_rake'`), e — se o vencedor tiver um indicador dentro da janela de 12 meses — credita a
  esse indicador `taxa * referral_commission_percent / 100` (saído da taxa já retida, não um valor extra
  cobrado de ninguém).

**Rationale**: O motor de jogo (quem venceu, quando a mesa termina) já mora inteiramente nessas funções;
duplicar essa decisão numa segunda camada criaria duas fontes de verdade sobre "quando uma mesa acabou" —
o oposto do que o Princípio II pede (centralizar a lógica sensível num único funil). Reaproveitar
`for update` já usado em `create_cacheta_table`/`start_cacheta_game` para lock de linha também evita
reintroduzir uma primitiva de concorrência nova.

**Alternatives considered**: Uma função `settle_cacheta_table_payout` genérica chamada por um cron/job
separado depois que a mesa termina — rejeitada por reintroduzir a necessidade de agendamento que o
projeto deliberadamente evita (Princípio VI, "sem infraestrutura de cron"); como `baterCombinacao` já é o
único caminho que marca uma mesa como `finished` com vencedor, calcular o payout ali é o ponto lazy
natural, sem fila.

## 7. Configuração de taxa da casa e comissão de indicação

**Decision**: Tabela singleton `platform_settings` (uma linha fixa, `id boolean primary key default
true check (id)` — mesmo truque de "linha única" já visto em outros projetos Supabase para config
global), colunas `house_rake_percent numeric not null default 10 check (between 0 and 100)`,
`referral_commission_percent numeric not null default 25 check (between 0 and 100)`, `pix_key text`,
`pix_key_owner_name text`. Escrita restrita a `is_super_admin()` (mesmo padrão de
`scoring_rules_write_super_admin`); leitura restrita a jogador identificado ou admin — nunca anônimo —
via um predicado `current_player_is_identified() or is_approved_admin()` (a chave Pix e os percentuais
não devem vazar para quem só está jogando de graça como convidado).

**Rationale**: `scoring_rules` é especificamente sobre pontuação de partidas de live scoring (domínio
diferente, não-monetário) — misturar essas duas tabelas confundiria dois domínios que a constituição
(Technology Constraints) já pede para manter separados. Uma tabela nova e pequena, espelhando o padrão
já estabelecido de "configuração só o super admin edita, resto só lê", é a opção mais simples que resolve
sem introduzir um sistema de configuração genérico.

**Alternatives considered**: Hardcode dos percentuais no código — rejeitada porque a spec (FR-011,
FR-016) exige explicitamente que sejam configuráveis pelo admin.

## 8. Pacotes de moedas "estilo TikTok"

**Decision**: Tabela `coin_packages` (admin-gerenciável via CRUD simples, mesmo padrão de
`scoring_rules`/`cachetao_events`): `id`, `name text`, `price_brl numeric not null check (> 0)`,
`coin_amount int not null check (> 0)`, `active boolean not null default true`,
`sort_order int not null default 0`. Sem lógica de "bônus" calculada pelo sistema — o próprio admin
define `price_brl`/`coin_amount` de cada tier livremente; a UI de admin apenas ordena por `sort_order` e
sugere, na tela de criação, que tiers maiores tenham uma razão moedas/real mais alta (texto de ajuda, não
validação de negócio).

**Rationale**: A spec (FR-002, Assumptions) já deixa explícito que os valores exatos ficam a critério do
admin — qualquer tentativa de "calcular o bônus automaticamente" seria uma regra de negócio inventada sem
pedido explícito (Princípio VI).

## 9. Convidado nunca acessa dinheiro — ponto único de gate

**Decision**: `current_player_is_guest()` (e seu inverso `current_player_is_identified()`, que também
retorna `false` quando não há jogador logado nenhum) é chamado em toda função/RPC nova que move dinheiro
(`create_cacheta_table` com entrada > 0, `join_cacheta_table` com entrada > 0, `request_coin_purchase`,
`set_referral_code`, qualquer leitura de `platform_settings`/`coin_packages` que exponha a chave Pix).
Não existe uma segunda checagem equivalente feita só no frontend — a UI esconde os botões para
convidados como UX, mas o gate real e único vive nessas funções.

**Rationale**: Princípio I da constituição — autorização vem do banco, nunca só de uma checagem de
aplicação. Replicar essa regra em mais de um lugar seria o mesmo tipo de duplicação que a constituição
pede para evitar (Princípio II).
