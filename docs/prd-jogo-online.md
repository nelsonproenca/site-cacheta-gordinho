# PRD — Jogo de Cacheta jogável (mesa virtual, contra robôs e online)

> Documento de especificação de uma **nova** frente de produto, extraída dos prints em `docs/tela0.jpeg` (referência visual de um app existente, "Cacheta League") e `docs/tela01.jpeg`/`docs/tela02.jpeg` (conversa no ChatGPT descrevendo o que deveria ser construído). Este arquivo é ponto de partida para discussão — ainda não foi validado nem priorizado frente ao restante do roadmap (`prd.md`, Fase 5 em andamento).

## 1. Contexto e motivação

O produto atual (`prd.md`) é uma ferramenta de **gestão/pontuação manual** de partidas de Cacheta jogadas numa live do TikTok: o admin registra manualmente quem venceu cada rodada e o sistema calcula ranking. Não existe hoje nenhum motor de jogo real — as cartas nunca são representadas digitalmente, o jogo acontece fisicamente (ou por voz/vídeo) e só o resultado final é digitado.

Os prints capturados descrevem algo estruturalmente diferente: um **jogo de cacheta jogável dentro do app**, com mesa virtual, baralho digital, IA e modo online — nos moldes do app de referência "Cacheta League". Isso é uma frente nova (não é uma evolução incremental da Fase 5), e deve ser tratada como tal no roadmap.

## 2. Referência visual (`docs/tela0.jpeg`)

Print de um app de cacheta já existente no mercado, usado como inspiração visual e funcional:

- **Mesa**: oval, com iluminação azul neon, fundo de terraço/cassino moderno (plantas, sofás, skyline noturno).
- **Topo da tela**: saldo de duas moedas diferentes (ex.: `0.46` com ícone de moeda dourada e um `+` de compra; `0.00` com ícone de moeda "B" — sugere moeda premium/paga e moeda gratuita/virtual separadas), atalho de **Rank** e atalho de **Premiação**.
- **Jogadores na mesa**: até 6 posições — avatares com nome e contagem de cartas na mão (ex. "Bot Beto — 7"), indicador de **dealer** (marcador "D"), estado **"Eliminado"** quando o jogador saiu da rodada.
- **Centro da mesa**:
  - **Coringa**: duas cartas reveladas no centro (a carta "vira" e a carta seguinte, que define o coringa).
  - **Monte**: pilha de compra com contagem de cartas restantes (ex. "Monte (62)").
  - **Descarte**: pilha de descarte com a última carta visível.
- **Jogador local ("Você")**: avatar com contagem de fichas/pontos (ex. "15"), contagem de cartas, mensagem de log da última ação ("Bot Cida comprou do monte.").
- **Mão do jogador**: cartas em leque na parte inferior, com naipes/valores legíveis.
- **Ações**: três botões — **Bater** (encerrar a rodada/trinca), **Descartar**, **Sair**.
- **Rodapé contextual**: "Mesa de treino · Contra robôs" — indica que existe pelo menos um modo de treino isolado contra IA, distinto do modo com apostas/moeda.

## 3. Especificação funcional (extraída de `docs/tela01.jpeg` e `docs/tela02.jpeg`)

Transcrição do que foi definido na conversa com o ChatGPT (preservada como requisito, não como decisão de arquitetura — este projeto usa Next.js + Supabase, não as stacks que o ChatGPT eventualmente tenha sugerido depois do corte do print):

> "Vamos criar o seu jogo de Cacheta inspirado nessa imagem, mantendo o visual de cassino moderno, a mesa azul iluminada, as cartas tradicionais e os avatares dos jogadores. A ideia é transformar essa referência em um protótipo jogável para celular Android, com dois modos: **contra o computador** e **online**."

### 3.1 Mesa e visual
- Mesa oval com iluminação azul neon.
- Baralho tradicional e monte de cartas empilhadas.
- Carta virada posicionada atrás do monte (define o coringa — ver regras).
- Avatares, placar e fichas dos jogadores visíveis na mesa.

### 3.2 Jogabilidade
- Tocar no monte para comprar carta.
- Arrastar uma carta para o descarte.
- Cronômetro de **15 segundos** por jogada (turno).
- Cartas organizadas automaticamente na mão do jogador.

### 3.3 Modos de jogo
- **Contra o computador**: adversários controlados por IA (bots).
- **Online**: jogar com outras pessoas em tempo real.
- Pontuação, eliminação, ranking e recompensas em ambos os modos.

## 4. Regras do Cacheta (já definidas previamente pelo usuário, reafirmadas no print)

> "Vou manter as regras que você já definiu para o projeto":

- **9 cartas na mão.**
- **Batida normal**: com 3 trincas.
- **Quadra**: sequência de 4 cartas, ou trinca com uma dobra.
- **Quina**: sequência de 5 cartas, ou trinca com duas dobras.
- **Coringa**: definido pela "vira" — a carta seguinte à vira, mantendo a mesma cor (naipe/cor do baralho).
- **Modo Cachetão**: pontuação própria, independente da pontuação normal.
- **Modo de 7 pontos**: regras especiais de batida (detalhe não capturado no print — corta antes do fim; precisa ser levantado com o usuário).

Observação importante: este conjunto de regras (quadra/quina/coringa pela vira) é **diferente** do domínio já implementado em `prd.md`/`scoring_rules` (que trata resultados de partidas marcados manualmente — "vitória lambreta", "derrota normal" etc., sem nenhum motor de regras de jogo real). As duas coisas vão coexistir como frentes paralelas (ver seção 7).

## 5. Decisões confirmadas com o usuário (2026-10-26)

1. **Relação com o produto atual**: **frente nova e paralela** — não substitui o fluxo manual de pontuação de lives (`matches`/`match_results`/`scoring_rules`). Será tratada como **Fase 6** do roadmap, separada da Fase 5 em andamento.
2. **Escopo do modo online**: **multiplayer em tempo real desde o início** — não é "só robôs primeiro, online depois". O motor de jogo precisa nascer com estado compartilhado entre jogadores reais (turnos, timer, mão oculta), não apenas contra IA.
3. **Moeda/economia**: **só moeda virtual/pontuação por enquanto** — sem aposta em dinheiro real no MVP deste jogo. Créditos pagos via Mercado Pago (Fase 5 M1–M5) ficam como integração futura, não bloqueante.

## 6. Lacunas que ainda restam (não bloqueiam o plano, mas precisam de resposta antes de cada fase correspondente)

1. **IA dos bots**: nível de sofisticação esperado (bot aleatório válido vs. bot com heurística de descarte/batida) — só relevante quando a IA entrar no escopo (ver plano).
2. **Regra do "modo de 7 pontos"**: o print corta antes de descrever as regras especiais de batida — precisa ser perguntado diretamente antes de implementar esse modo específico.
3. **Native Android vs. web**: o print pede "protótipo jogável para celular Android" — este projeto é Next.js web (PWA-capable, não app nativo). Assumindo, por consistência com o resto do site, que o requisito é um **web app responsivo** (não um app nativo de loja) até o usuário dizer o contrário.
4. **Escopo de "ranking e recompensas"** neste novo jogo: assumir, até decisão em contrário, que é um **ranking paralelo específico do jogo jogável** (não o mesmo `scoring_rules`/ranking de lives) — consistente com a decisão de frente nova e paralela do item 5.1.

## 7. Como isso se encaixa no roadmap existente

- Fase 5 (`prd.md` §4.10–§4.16) já cobre **M0** (login do jogador via OTP) e **M6/M7** (live streaming + chat in-app). Este PRD é tratado como **Fase 6 — Jogo jogável**, nova e paralela, sem créditos pagos no MVP (M1–M5 da Fase 5 seguem como integração futura e não bloqueante).
- Reaproveita diretamente a identidade de jogador já implementada (M0: `players.auth_user_id`, login por telefone) — um jogador que já existe no sistema (por handle, registrado manualmente ou via OTP) pode ser o mesmo que senta numa mesa virtual.
- Não deve reaproveitar `matches`/`match_results`/`scoring_rules` como estão — esse domínio é "registro de resultado pós-jogo digitado por um admin", não "estado de uma partida em andamento". Um novo conjunto de tabelas (ex. `cacheta_tables`, `cacheta_table_players`, `cacheta_hands`, `cacheta_moves`) seria necessário para representar o motor de jogo propriamente dito.
