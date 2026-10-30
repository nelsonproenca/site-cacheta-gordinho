# Phase 0 Research: Jogo de Cacheta jogável

Nenhum item do Technical Context ficou marcado `NEEDS CLARIFICATION` — todas as decisões
abaixo se apoiam em padrões já provados neste repositório (ver `CLAUDE.md` e exploração
direta do código nesta sessão), não em tecnologia nova. Este documento registra a decisão,
o porquê, e as alternativas descartadas para cada escolha não-trivial.

## 1. Mecanismo de tempo real: `postgres_changes`, não Presence/Broadcast

**Decision**: Sincronizar o estado público da mesa (vez, contagem de cartas, topo do
descarte) e a própria mão do jogador via Supabase Realtime `postgres_changes`, no mesmo
padrão de `components/broadcast/live-chat.tsx` (fetch inicial + `supabase.channel(...).on
("postgres_changes", ...)` + dedupe por id + `removeChannel` no cleanup).

**Rationale**: É o único mecanismo de Realtime já usado em produção neste projeto. Ele
respeita RLS nativamente (a policy de SELECT de cada tabela decide o que cada assinante
recebe), o que já resolve a exigência de privacidade da mão (spec `FR-008`, `SC-003`) sem
nenhuma peça nova. Presence/Broadcast nunca foi usado aqui — introduzi-los agora somaria
uma segunda forma de canal, com sua própria curva de confiabilidade, para um ganho que
`postgres_changes` já cobre (não há necessidade de saber "quem está olhando" para o MVP,
só de propagar mudanças de linha).

**Alternatives considered**:
- *Presence* (saber quem está conectado/ausente): resolveria melhor o caso de "oponente
  desconectado" do que a expiração lazy de turno, mas é infraestrutura nova sem precedente
  no projeto — fica como extensão futura explícita (ver `spec.md`, Edge Cases), não bloqueia
  o MVP, já que a expiração de turno por timeout já cobre o caso funcionalmente.
- *Broadcast* (canal efêmero, sem persistência): dispensaria gravar `cacheta_moves` para
  propagar jogadas, mas perderia o log persistente/auditável que a spec pede (Key Entities:
  "Jogada") e que o padrão de log do projeto (`live_chat_messages`, `cross_account_matches`)
  já privilegia.

## 2. Onde a mão de cada jogador fica oculta: tabela própria com RLS restrita, não uma SELECT ampla com ocultação client-side

**Decision**: `cacheta_hands` é uma tabela separada de `cacheta_table_seats`, com SELECT
restrito via RLS a `seat.player_id = current_player_id()`. O estado **público** da mesa
(`cacheta_tables`, `cacheta_table_seats`, `cacheta_moves`) usa SELECT amplo a qualquer
assento da mesa.

**Rationale**: A lição documentada em `20260801000039_live_chat.sql` é que uma policy de
SELECT **não pode** ficar mais restritiva que "o necessário para a entrega do evento" sob
pena de o Realtime parar de entregar updates (ex.: esconder `deleted_at` na policy quebra a
entrega do evento de soft-delete). Isso se aplica a estado que *todo mundo* pode ver em
algum momento (ex. uma mensagem apagada ainda existiu publicamente). A mão de um jogador é
estruturalmente diferente — **nunca** deve ser vista por outro jogador, em nenhum momento —
então o problema do chat não se aplica: pode (e deve) ter uma policy de SELECT genuinamente
restrita, porque só o próprio dono dela precisa do evento de Realtime daquela linha.

**Alternatives considered**:
- Guardar a mão como uma coluna jsonb em `cacheta_table_seats` com SELECT amplo e ocultar o
  conteúdo no cliente: rejeitado — expõe a mão de todo mundo a qualquer assento via
  inspeção direta da resposta de rede, violando `FR-008`/`SC-003` de forma grave (a mesma
  classe de erro que o CLAUDE.md já documenta ter corrigido duas vezes para colunas
  sensíveis).

## 3. Onde validar "bater": TypeScript puro + Server Action, não uma função plpgsql

**Decision**: A combinação de trincas/quadra/quina/coringa é validada por um módulo
TypeScript puro e testável (`lib/cacheta/rules.ts`), chamado por uma Server Action
(`baterCombinacao`) que primeiro lê a mão do jogador através do cliente por-requisição
(RLS já garante que só a própria mão é legível) e, com a combinação validada, grava o
resultado usando `createServiceClient()`.

**Rationale**: É exatamente o idioma já usado em `endBroadcastManually`
(`lib/actions/live-broadcasts.ts`) — "confirma acesso através do cliente RLS normal, só
então usa o cliente de privilégio para a escrita final". Lógica de combinação de cartas
(permutações de trincas, sequências, dobras, coringa) é genuinamente mais fácil de escrever,
ler e testar em TypeScript puro do que em plpgsql, e não precisa da atomicidade de uma RPC
de banco — o único requisito de atomicidade real é "a escrita final (resultado + pontuação)
acontece de uma vez", que o cliente service-role já garante numa única operação.

**Alternatives considered**:
- Validar tudo dentro de uma função `security definer` em plpgsql, como as jogadas simples:
  rejeitado para esta operação específica — plpgsql não tem uma forma ergonômica de expressar
  "todas as permutações possíveis de agrupar 9 cartas em trincas/sequências", e qualquer bug
  ali seria muito mais caro de testar isoladamente do que um módulo TypeScript com testes
  unitários diretos.

## 4. Jogadas simples (comprar/descartar): RPC `security definer`, não Server Action

**Decision**: `draw_from_monte`, `draw_from_discard`, `discard_card`, `expire_turn` e
`advance_bot_turn` são funções `security definer` chamadas diretamente via
`supabase.rpc(...)` do cliente (como `send_live_chat_message`), não Server Actions.

**Rationale**: São operações de baixa latência, chamadas repetidamente durante uma partida
(cada turno), com regras de validação simples (turno correto, posse da carta) que cabem bem
numa função de banco atômica. Isso evita o custo de round-trip de uma Server Action
completa (`revalidatePath` etc.) para cada jogada — mesmo raciocínio documentado para
`send_live_chat_message` ser a primeira exceção ao padrão de Server Action do projeto.

**Alternatives considered**:
- Server Actions para tudo, por uniformidade: rejeitado por latência — um jogo por turnos
  com timer de 15s não deve pagar o custo de formulário + revalidação de rota a cada compra/
  descarte; o precedente do chat já abriu esse caminho no projeto.

## 5. Timer de turno e avanço de bots: padrão lazy, sem cron

**Decision**: `turn_deadline_at` é um timestamp absoluto gravado no banco a cada avanço de
turno. Qualquer cliente presente na mesa, ao detectar (via UI local, adaptando
`components/closing-countdown.tsx`) que o prazo expirou, chama a RPC `expire_turn(table_id)`,
que reconfirma `now() > turn_deadline_at` com `for update` antes de agir (idempotente sob
corrida). Avanço de bots segue o mesmo princípio: depois de cada jogada humana bem-sucedida,
o cliente chama `advance_bot_turn(table_id)` em sequência enquanto a vez for de um assento
`is_bot`.

**Rationale**: Replica exatamente o padrão já estabelecido (`closeStaleLiveSessions`,
`syncCachetaoEventStatus`) — nenhuma infraestrutura de scheduler (Vercel Cron, pg_cron)
existe hoje neste projeto, e introduzi-la só para isso violaria o Princípio VI da
constituição (simplicidade sobre abstração especulativa) sem necessidade comprovada.

**Alternatives considered**:
- Vercel Cron/pg_cron varrendo turnos expirados periodicamente: mais "correto" no sentido
  de não depender de um cliente estar olhando, mas introduz infraestrutura nova sem
  precedente para um problema que o padrão lazy já resolve adequadamente (há sempre pelo
  menos um cliente — o próprio jogador aguardando sua vez — capaz de disparar a expiração).

## 6. Plataforma alvo: web responsivo, não app Android nativo

**Decision**: Implementar como páginas Next.js responsivas dentro do mesmo site, não como um
app nativo Android.

**Rationale**: O material de referência (print do ChatGPT) pede "protótipo jogável para
celular Android", mas este projeto é inteiramente Next.js/Vercel — não há toolchain nativa,
e o restante do produto (incluindo o M0/M6/M7 da Fase 5, já em produção) segue o mesmo
padrão web responsivo. Tratado como suposição documentada (`spec.md`, Assumptions), não como
decisão silenciosa — se o usuário realmente precisar de um app de loja, isso é uma frente
adicional separada, não algo a assumir aqui.

**Alternatives considered**: Nenhuma avaliada a fundo — construir um app nativo exigiria uma
stack e um pipeline de distribuição completamente diferentes dos já estabelecidos no
projeto, e nada no PRD ou nas decisões já confirmadas com o usuário (ver `docs/prd-jogo-online.md`
§5) indica que isso é um requisito real, e não apenas um artefato de como o ChatGPT
formulou o pedido original.
