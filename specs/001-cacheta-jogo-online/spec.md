# Feature Specification: Jogo de Cacheta jogável (mesa virtual, robôs e online)

**Feature Branch**: `001-cacheta-jogo-online`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Jogo de Cacheta jogável (mesa virtual, contra robôs e online) — especificação completa já está em docs/prd-jogo-online.md, escrita a partir de prints de referência (app existente 'Cacheta League') e de uma especificação do próprio usuário. Dois modos (contra robôs e online multiplayer em tempo real, online desde o início). Regras: mão de 9 cartas, batida normal com 3 trincas, quadra, quina, coringa pela vira, modo Cachetão, modo de 7 pontos (pendente de detalhe). Frente nova e paralela ao fluxo de pontuação manual de lives já existente — não reutiliza matches/match_results/scoring_rules. Sem dinheiro real no MVP."

## Contexto do produto existente

Este site já gerencia, em produção, as lives de Cacheta de um criador do TikTok: pontuação manual por admin, rankings por período, evento "Cachetão" com inscrição, campeonatos, múltiplas contas gerenciadas e, mais recentemente, login de jogador, transmissão ao vivo in-app e chat. Esta feature é uma **frente nova e paralela**: um jogo de Cacheta de fato jogável dentro do site (mesa virtual, baralho digital, jogadas reais), para jogadores já autenticados na plataforma. Ela **não substitui** o fluxo existente de registro manual de resultados de uma live — as duas coisas coexistem.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Jogar uma partida completa contra robôs (Priority: P1)

Um jogador autenticado abre uma mesa de treino, senta-se com assentos restantes preenchidos por oponentes controlados pelo sistema, recebe sua mão de 9 cartas, joga os turnos (compra, descarte, eventual batida) e a partida chega a um resultado (alguém bate, ou o jogador é eliminado/desiste).

**Why this priority**: É a fatia mínima que prova que o motor de regras do Cacheta (trincas, quadra, quina, coringa, batida) e a mesa visual funcionam corretamente, sem depender de sincronizar dois jogadores reais ao mesmo tempo — é testável e demonstrável sozinho, e é pré-requisito de qualidade para o modo online (as mesmas regras valem nos dois modos).

**Independent Test**: Um único jogador, numa única sessão, cria uma mesa contra robôs, joga uma rodada do início ao fim e vê o resultado — sem precisar de um segundo jogador real.

**Acceptance Scenarios**:

1. **Given** um jogador autenticado sem partida em andamento, **When** ele cria uma mesa de treino contra robôs, **Then** a mesa é criada, os assentos restantes são preenchidos por oponentes do sistema, e cada participante (incluindo o jogador) recebe uma mão de 9 cartas e a carta "vira"/coringa é definida.
2. **Given** é a vez do jogador, **When** ele compra uma carta (do monte ou do descarte) e descarta uma carta de sua mão, **Then** sua mão volta a ter 9 cartas, a carta descartada aparece no topo da pilha de descarte, e a vez passa ao próximo assento.
3. **Given** o jogador tem uma combinação válida de batida na mão (3 trincas, ou quadra, ou quina, conforme as regras), **When** ele aciona "Bater", **Then** o sistema confirma a combinação como válida, encerra a rodada e indica o jogador como vencedor.
4. **Given** o jogador tenta bater com uma combinação inválida, **When** ele aciona "Bater", **Then** o sistema rejeita a jogada, explica o motivo, e a mão do jogador permanece inalterada.
5. **Given** é a vez de um oponente controlado pelo sistema, **When** o turno chega a ele, **Then** o sistema decide e executa automaticamente uma jogada válida para esse oponente, sem exigir ação do jogador humano.

---

### User Story 2 - Jogar uma partida online com outro jogador real (Priority: P2)

Um jogador cria ou entra numa mesa online e joga uma partida real-time com um ou mais outros jogadores humanos, vendo em tempo real as jogadas do adversário (sem ver a mão privada dele) e respeitando um limite de tempo por turno.

**Why this priority**: É o diferencial central pedido (multiplayer em tempo real "desde o início"), mas depende logicamente de a User Story 1 já ter validado o motor de regras — a complexidade adicional aqui é exclusivamente de sincronização entre jogadores e tempo real, não de regras do jogo.

**Independent Test**: Duas contas de jogador distintas, em duas sessões separadas, entram na mesma mesa online e completam uma rodada — testável sem envolver nenhum oponente controlado pelo sistema.

**Acceptance Scenarios**:

1. **Given** um jogador cria uma mesa online, **When** outro jogador real entra nessa mesa, **Then** ambos veem o outro ocupando um assento, e a partida pode começar quando os assentos mínimos estiverem preenchidos.
2. **Given** uma partida online em andamento, **When** um jogador realiza uma jogada (compra/descarte/batida), **Then** todos os demais jogadores da mesma mesa veem o efeito dessa jogada (contagem de cartas do adversário, carta descartada, de quem é a vez) quase imediatamente, sem precisar recarregar a página.
3. **Given** a mão de um jogador numa partida online, **When** qualquer outro jogador da mesma mesa tenta visualizar essa mão, **Then** o conteúdo da mão permanece oculto — apenas a contagem de cartas é visível aos demais.
4. **Given** é a vez de um jogador e o tempo limite do turno se esgota sem que ele jogue, **When** o prazo expira, **Then** o sistema executa automaticamente uma jogada padrão em nome do jogador e passa a vez adiante, sem travar a partida para os demais.

---

### User Story 3 - Acompanhar resultado, pontuação e ranking do jogo (Priority: P3)

Ao final de uma partida (treino ou online), o jogador vê o resultado (quem bateu, pontuação da rodada) e pode consultar um ranking de jogadores baseado no desempenho neste jogo jogável.

**Why this priority**: Dá sentido competitivo e de retenção ao recurso, mas o jogo já entrega valor (User Stories 1 e 2) antes de ter ranking/pontuação acumulada — por isso fica depois.

**Independent Test**: Após completar ao menos uma partida (treino ou online), o jogador consegue abrir uma tela de ranking e ver sua própria posição/pontuação refletida.

**Acceptance Scenarios**:

1. **Given** uma partida terminou com um vencedor, **When** a tela de resultado é exibida, **Then** ela mostra quem venceu e a pontuação da rodada atribuída.
2. **Given** partidas já disputadas por vários jogadores, **When** um jogador abre o ranking do jogo, **Then** ele vê uma lista ordenada de jogadores por pontuação/desempenho neste jogo — e essa lista é visivelmente separada do ranking de pontuação manual de lives já existente no site.

---

### Edge Cases

- O que acontece se um jogador fecha a aba/perde conexão no meio de uma partida online? A partida não pode travar indefinidamente para os demais — o comportamento esperado é equivalente ao de um turno expirado (ver User Story 2, cenário 4), repetido a cada turno desse jogador até ele reconectar ou a mesa ser encerrada por inatividade.
- O que acontece se um jogador tenta bater fora de sua vez, ou tenta descartar uma carta que não está em sua mão? A jogada deve ser rejeitada sem alterar o estado da partida, com uma explicação clara ao jogador.
- O que acontece se dois jogadores de uma mesma mesa tentam agir simultaneamente (ex.: dois cliques quase ao mesmo tempo)? Apenas a jogada de quem realmente detém a vez corrente é aceita; a outra é rejeitada sem corromper o estado da partida.
- Se o monte de compra se esgota durante uma rodada (ninguém bateu ainda), o sistema reabastece o monte embaralhando a pilha de descarte (exceto a carta do topo, que permanece visível) e a rodada continua normalmente.
- Um jogador pode ter mais de uma mesa (treino ou online) em andamento ao mesmo tempo? Assumido que não, para manter a experiência simples — ver seção de Assumptions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um jogador autenticado crie uma mesa de treino contra oponentes controlados pelo sistema, com os assentos vagos preenchidos automaticamente.
- **FR-002**: O sistema MUST permitir que um jogador autenticado crie uma mesa online e que outros jogadores autenticados entrem nela antes do início da partida.
- **FR-003**: Ao iniciar uma partida (treino ou online), o sistema MUST distribuir 9 cartas para cada assento ocupado e definir a carta "vira" e, a partir dela, o coringa da rodada (a carta seguinte à vira, mantendo a mesma cor).
- **FR-004**: O sistema MUST impor turnos ordenados entre os assentos, permitindo apenas ao assento da vez corrente comprar (do monte ou do descarte) e, em seguida, descartar uma carta.
- **FR-005**: O sistema MUST impor um limite de tempo de 15 segundos por turno e, ao expirar, executar automaticamente uma jogada padrão em nome do jogador da vez, avançando ao próximo assento.
- **FR-006**: O sistema MUST validar uma tentativa de "bater" contra as regras do Cacheta: batida normal (3 trincas), quadra (sequência de 4 cartas, ou trinca com uma dobra), e quina (sequência de 5 cartas, ou trinca com duas dobras) — usando o coringa definido na rodada.
- **FR-007**: O sistema MUST rejeitar qualquer jogada que não pertença ao assento da vez corrente, ou que envolva uma carta que não esteja de fato na mão do jogador que a propõe.
- **FR-008**: O sistema MUST manter a mão de cada jogador oculta dos demais participantes da mesma mesa, expondo a eles apenas a contagem de cartas e as cartas já públicas (vira, coringa, topo do descarte).
- **FR-009**: Numa partida online, o sistema MUST propagar o estado público da mesa (de quem é a vez, contagem de cartas de cada assento, topo do descarte, prazo do turno corrente) a todos os participantes em tempo real, sem exigir que recarreguem a página.
- **FR-010**: O sistema MUST suportar o modo "Cachetão" com pontuação própria, estruturalmente separada da pontuação de batida normal/quadra/quina.
- **FR-011**: O sistema MUST reservar um modo "7 pontos" com regras especiais de batida — **escopo adiado**: as regras específicas ainda não foram detalhadas pelo usuário (o material de referência corta antes dessa definição) e devem ser levantadas antes de qualquer planejamento/implementação deste modo especificamente; isso não bloqueia as demais user stories e requisitos desta spec.
- **FR-012**: Ao término de uma partida, o sistema MUST registrar o resultado (vencedor, tipo de batida, pontuação atribuída) de forma estruturalmente separada dos registros de resultado de lives já existentes no site (não deve gravar nem ler das mesmas tabelas/relatórios usados pelo fluxo manual de pontuação de lives).
- **FR-013**: O sistema MUST oferecer um ranking de jogadores baseado no desempenho neste jogo jogável, distinto do ranking de pontuação manual de lives.
- **FR-014**: O sistema MUST restringir a criação/participação de mesas a jogadores autenticados na plataforma (não permitir participação anônima).
- **FR-015**: O sistema MUST operar sem envolver dinheiro real nesta fase — qualquer pontuação, moeda ou recompensa exibida é virtual/cosmética, sem transação financeira associada.

### Key Entities *(include if feature involves data)*

- **Mesa (partida)**: uma instância de jogo em andamento ou concluída — modo (treino/online), estado (aguardando/em andamento/encerrada), de quem é a vez, prazo do turno corrente, carta vira/coringa, topo do descarte, contagem restante no monte.
- **Assento**: a posição de um participante numa mesa — jogador humano ou oponente controlado pelo sistema, sua contagem pública de cartas, e seu estado (ativo/eliminado/bateu).
- **Mão**: o conjunto privado de cartas de um assento específico — visível apenas ao próprio jogador (ou ao sistema, no caso de um oponente automático).
- **Jogada**: um evento registrado de uma ação tomada num turno (comprar, descartar, bater, ou expiração automática de turno) — alimenta o histórico/feed da partida.
- **Resultado de partida**: o registro de como uma mesa terminou — vencedor, tipo de combinação de batida, pontuação atribuída — base do ranking deste jogo.
- **Ranking do jogo**: uma classificação agregada de jogadores por desempenho nas partidas deste jogo jogável, separada do ranking de lives já existente no site.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um jogador consegue iniciar e concluir uma partida completa de treino (contra robôs), do início até um resultado, sem travamentos ou estados inconsistentes da mesa.
- **SC-002**: Em uma partida online com dois ou mais jogadores reais, uma jogada de um participante é refletida na tela dos demais participantes em até alguns segundos, de forma consistente para todos.
- **SC-003**: Em 100% dos casos testados, a mão de um jogador nunca é visível a outro participante da mesma mesa, mesmo através de inspeção direta dos dados retornados ao navegador.
- **SC-004**: Tentativas de jogada inválida (fora de turno, carta inexistente na mão, combinação de batida incorreta) são rejeitadas em 100% dos casos, sem corromper o estado da partida para os demais participantes.
- **SC-005**: Um turno que não recebe ação do jogador dentro do prazo é resolvido automaticamente, sem exigir intervenção manual de um administrador, em 100% dos casos.
- **SC-006**: O ranking e a pontuação deste jogo jogável nunca aparecem misturados ao ranking de pontuação manual de lives já existente no site, nem o afetam.

## Assumptions

- O jogo é acessado como parte do site já existente, exigindo o mesmo login de jogador (telefone/OTP) já implementado na plataforma — não há um fluxo de autenticação separado para este recurso.
- Um jogador participa de no máximo uma mesa ativa por vez, para manter a experiência simples nesta primeira versão; múltiplas mesas simultâneas por jogador ficam fora de escopo até indicação em contrário.
- "Online" significa jogadores reais da própria plataforma jogando entre si em tempo real — não inclui, nesta fase, matchmaking com qualquer sistema externo ou integração com o TikTok.
- O comportamento padrão de expiração de turno (FR-005) é descartar automaticamente uma carta da mão do jogador da vez (sem comprar), já que este é o comportamento menos arriscado para o jogador ausente.
- As regras especiais do "modo 7 pontos" (FR-011) ficam como escopo adiado — não bloqueiam o planejamento/implementação da mesa, do motor de regras padrão (batida/quadra/quina) nem do modo Cachetão.
- O modo "Cachetão" e o modo "7 pontos" deste jogo jogável são conceitos de pontuação específicos deste recurso, e não devem ser confundidos com o evento "Cachetão" (inscrição/presença em um evento de sábado) já existente no site — ainda que compartilhem o nome.
- Recompensas/"premiação" mencionadas no material de referência são tratadas como cosméticas/de engajamento nesta fase, sem qualquer valor monetário resgatável (consistente com "sem dinheiro real no MVP").
