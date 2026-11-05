# Feature Specification: Moedas, Mesas Pagas e Indicação

**Feature Branch**: `002-moedas-pagamento-indicacao`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "Monetização 'Moedas' — carteira de moedas virtuais, compra via Pix com
confirmação manual pelo admin, mesas pagas no jogo de Cacheta, e programa de indicação/afiliados com
comissão real sobre a taxa da casa. Jogadores identificados (e-mail/senha, Google ou telefone) podem
comprar pacotes de moedas estilo TikTok, criar/entrar em mesas de Cacheta com valor de entrada,
e indicar outros jogadores ganhando comissão sobre a taxa da casa gerada pelos indicados. Jogadores
convidados (anônimos) continuam podendo jogar treino/online de graça, mas sem acesso a nada disso.
Confirmação de pagamento é manual (comprovante enviado pelo jogador, aprovado por um admin no painel) —
sem integração com um provedor de pagamento nesta fase."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Comprar moedas com Pix e confirmação manual (Priority: P1)

Um jogador identificado (não-convidado) quer comprar moedas para poder criar ou entrar em mesas pagas.
Ele escolhe um pacote de moedas, vê a chave Pix e o valor a pagar, faz o Pix pelo próprio banco, envia
o comprovante (imagem ou texto) pelo site, e aguarda a aprovação. Um admin revisa o comprovante no
painel e aprova ou rejeita o pedido; ao aprovar, as moedas entram imediatamente no saldo do jogador.

**Why this priority**: Sem carteira de moedas nenhuma outra parte da feature (mesas pagas, indicação)
tem o que mover — é o alicerce de todo o resto.

**Independent Test**: Pode ser testado sozinho — um jogador identificado consegue solicitar um pacote,
enviar comprovante, um admin aprova, e o saldo exibido do jogador aumenta pelo valor correto do pacote.
Entrega valor mesmo sem mesas pagas ou indicação existirem ainda.

**Acceptance Scenarios**:

1. **Given** um jogador identificado sem comprovante pendente, **When** ele escolhe um pacote de moedas
   e confirma que vai pagar, **Then** o sistema mostra a chave Pix da casa, o valor exato em reais do
   pacote escolhido, e um campo para anexar o comprovante.
2. **Given** um jogador enviou um comprovante para um pacote, **When** um admin aprova esse pedido no
   painel, **Then** o saldo de moedas do jogador aumenta exatamente pela quantidade de moedas do pacote
   e o jogador vê o novo saldo e o pedido marcado como aprovado.
3. **Given** um jogador enviou um comprovante, **When** um admin rejeita esse pedido (ex.: comprovante
   inválido), **Then** nenhuma moeda é creditada, o pedido fica marcado como rejeitado com o motivo, e o
   jogador consegue ver esse status.
4. **Given** um jogador convidado (anônimo, sem conta identificada), **When** ele tenta acessar a tela de
   compra de moedas, **Then** o sistema pede para ele criar/entrar numa conta identificada primeiro, sem
   mostrar nenhum pacote ou chave Pix.
5. **Given** um jogador com um pedido de compra já pendente de aprovação, **When** ele tenta abrir um
   segundo pedido para o mesmo pacote, **Then** o sistema permite múltiplos pedidos pendentes em
   paralelo (cada um com seu próprio comprovante), sem bloquear novas compras.

---

### User Story 2 - Criar e jogar mesas pagas de Cacheta (Priority: P2)

Um jogador identificado com saldo de moedas quer apostar moedas numa partida de Cacheta contra outros
jogadores reais. Ele cria uma mesa definindo quantas moedas cada jogador paga para entrar. Outros
jogadores identificados com saldo suficiente entram pagando esse valor. Quando a partida termina, o
vencedor recebe o pote total (soma de todas as entradas) menos a taxa da casa; os jogadores que não
venceram não recebem nada de volta.

**Why this priority**: É o motivo de existir a carteira de moedas (US1) — sem mesa paga, comprar moedas
não tem propósito dentro do produto. Depende de US1 estar pronta (saldo precisa existir para pagar a
entrada).

**Independent Test**: Pode ser testado com dois jogadores identificados que já têm saldo suficiente
(creditado manualmente para o teste) — um cria a mesa com valor de entrada, o outro entra pagando esse
valor, a partida roda normalmente (mesma jogabilidade já existente), e ao final o saldo do vencedor e
dos perdedores reflete corretamente o pote menos a taxa.

**Acceptance Scenarios**:

1. **Given** um jogador identificado com saldo de moedas, **When** ele cria uma mesa de Cacheta
   informando um valor de entrada em moedas, **Then** esse valor em moedas já é debitado do saldo do
   criador como sua própria entrada, e a mesa aparece como aguardando outros jogadores.
2. **Given** uma mesa paga aguardando jogadores, **When** outro jogador identificado com saldo
   suficiente entra nessa mesa, **Then** o valor de entrada é debitado do saldo desse jogador e ele
   ocupa um assento.
3. **Given** um jogador identificado com saldo insuficiente para o valor de entrada de uma mesa,
   **When** ele tenta entrar nela, **Then** o sistema impede a entrada e explica que o saldo é
   insuficiente, sem debitar nada.
4. **Given** uma mesa paga com todos os assentos ocupados e a partida em andamento, **When** um jogador
   bate e vence a partida, **Then** o saldo do vencedor aumenta pelo pote total (soma de todas as
   entradas) menos a taxa da casa, e os saldos dos demais jogadores não mudam.
5. **Given** um jogador convidado (anônimo), **When** ele tenta criar ou entrar numa mesa com valor de
   entrada maior que zero, **Then** o sistema bloqueia a ação e pede uma conta identificada — mesas sem
   valor de entrada (gratuitas) continuam funcionando normalmente para convidados, exatamente como hoje.

---

### User Story 3 - Indicar jogadores e ganhar comissão (Priority: P3)

Um jogador identificado quer indicar outras pessoas para a plataforma e ganhar uma parte da taxa da casa
gerada por elas. Ele escolhe um código de indicação próprio e recebe um link para compartilhar. Quando
alguém cria uma conta usando esse link/código, essa pessoa fica vinculada ao indicador. Sempre que o
indicado joga uma mesa paga, uma parte da taxa da casa dessa mesa vira comissão do indicador.

**Why this priority**: Só faz sentido depois que mesas pagas (US2) já geram taxa da casa — é a parte
mais avançada da feature, que depende das outras duas estarem funcionando primeiro.

**Independent Test**: Pode ser testado com um jogador que define seu código de indicação, um segundo
jogador que se cadastra usando o link desse código, e depois uma mesa paga jogada pelo indicado — ao
final, o saldo de comissão do indicador reflete o percentual correto sobre a taxa da casa daquela mesa.

**Acceptance Scenarios**:

1. **Given** um jogador identificado sem código de indicação ainda escolhido, **When** ele define um
   código próprio disponível, **Then** o sistema gera um link único (ex. `site.com/?ref=CODIGO`) para
   ele compartilhar, e esse código não pode mais ser alterado depois.
2. **Given** uma pessoa nova acessando o link de indicação de um jogador, **When** ela cria sua conta
   (qualquer método: e-mail/senha, Google ou telefone), **Then** essa nova conta fica permanentemente
   vinculada como indicada daquele jogador.
3. **Given** um jogador indicado jogando uma mesa paga dentro do período de vigência da indicação,
   **When** essa mesa termina e a taxa da casa é retida, **Then** o saldo de comissão do indicador
   aumenta pelo percentual configurado sobre essa taxa.
4. **Given** um jogador indicado jogando uma mesa paga depois do período de vigência da indicação (ex.
   após 12 meses do cadastro), **When** essa mesa termina, **Then** nenhuma comissão é gerada para o
   antigo indicador.
5. **Given** um jogador convidado (anônimo) sem conta identificada, **When** ele tenta definir ou usar
   um código de indicação, **Then** o sistema bloqueia a ação e pede uma conta identificada primeiro.

---

### User Story 4 - Cadastro/login melhorado com nick e Google (Priority: P4)

Uma pessoa nova quer criar uma conta identificada de forma rápida: escolhe um nick que já é validado
como disponível enquanto digita, e pode entrar direto com sua conta Google em vez de preencher
e-mail/senha manualmente.

**Why this priority**: Melhora a conversão de cadastro, mas é independente das outras três — o resto da
feature funciona com o fluxo de identificação já existente (e-mail/senha, telefone). Prioridade mais
baixa por não bloquear nada funcionalmente.

**Independent Test**: Pode ser testado sozinho, sem nenhuma das outras três stories — digitar um nick já
em uso mostra indisponibilidade antes de enviar o formulário, um nick livre mostra disponibilidade, e
"Continuar com Google" cria/entra numa conta sem pedir senha.

**Acceptance Scenarios**:

1. **Given** a tela de criação de conta, **When** a pessoa digita um nick que já pertence a outro
   jogador, **Then** o sistema avisa que o nick está indisponível antes mesmo de ela tentar enviar o
   formulário.
2. **Given** a tela de criação de conta, **When** a pessoa digita um nick livre, **Then** o sistema
   confirma visualmente que o nick está disponível.
3. **Given** a tela de criação de conta, **When** a pessoa escolhe "Continuar com Google", **Then** ela
   autentica com sua conta Google e, se for a primeira vez, define um nick em seguida; se já tiver conta
   vinculada a esse Google, entra direto.

---

### Edge Cases

- O que acontece se dois jogadores entrarem no último assento de uma mesa paga ao mesmo tempo? O sistema
  deve garantir que o débito de moedas e a ocupação do assento aconteçam juntos, de forma que nunca mais
  jogadores do que assentos disponíveis sejam debitados.
- O que acontece se um admin aprovar um comprovante duas vezes por engano? As moedas não podem ser
  creditadas duas vezes para o mesmo pedido.
- O que acontece com o pote de uma mesa paga que é abandonada antes de terminar (ex. um jogador cai e a
  mesa expira)? As moedas já debitadas de cada jogador que entrou devem ser devolvidas a ele, sem gerar
  taxa da casa nem comissão de indicação.
- O que acontece se o indicador tentar se autoindicar (usar o próprio código)? O sistema deve impedir
  essa vinculação.
- O que acontece se um jogador indicado trocar de conta/criar uma segunda conta usando o mesmo link de
  indicação? Cada conta nova vinculada ao mesmo código gera comissão separadamente; não há limite de
  quantas pessoas um único código pode indicar.
- O que acontece com uma mesa paga criada por um jogador identificado quando ele depois faz logout e
  volta como convidado? A mesa e o saldo continuam vinculados à conta identificada, não ao navegador —
  convidado não tem acesso a nenhuma mesa paga de nenhuma conta.
- O que acontece se o valor de entrada de uma mesa for maior que o saldo de moedas disponível de um
  pacote comprado mas ainda não aprovado? Moedas de um pedido pendente (ainda não aprovado por um admin)
  não contam para o saldo disponível até serem aprovadas.

## Requirements *(mandatory)*

### Functional Requirements

**Carteira e compra de moedas**

- **FR-001**: O sistema MUST manter um saldo de moedas por jogador identificado (nunca por jogador
  convidado/anônimo).
- **FR-002**: O sistema MUST oferecer pacotes de moedas configuráveis pelo admin, cada um com um preço
  em reais e uma quantidade de moedas, seguindo um padrão de tiers crescentes (pequeno, médio, grande,
  mega) em que pacotes mais caros entregam uma proporção de moedas por real maior que pacotes mais
  baratos (bônus progressivo) — valores exatos de preço/quantidade de cada tier são definidos pelo admin,
  não fixos no sistema.
- **FR-003**: O sistema MUST permitir que um jogador identificado solicite a compra de um pacote,
  mostrando a chave Pix da casa e o valor exato a pagar, e anexe um comprovante de pagamento.
- **FR-004**: O sistema MUST manter cada pedido de compra num de três estados: pendente, aprovado ou
  rejeitado, e deixar esse status visível ao jogador que fez o pedido.
- **FR-005**: O sistema MUST permitir que apenas um admin aprove ou rejeite um pedido de compra pendente.
- **FR-006**: O sistema MUST creditar o saldo do jogador com a quantidade exata de moedas do pacote
  somente no momento em que um admin aprova o pedido, e MUST impedir que o mesmo pedido seja aprovado
  mais de uma vez.
- **FR-007**: O sistema MUST impedir qualquer jogador convidado (anônimo) de ver pacotes, solicitar
  compra, ou ter saldo de moedas.

**Mesas pagas**

- **FR-008**: O sistema MUST permitir que o criador de uma mesa de Cacheta defina um valor de entrada em
  moedas (incluindo zero, preservando o comportamento gratuito já existente).
- **FR-009**: O sistema MUST debitar do saldo de cada jogador identificado o valor de entrada definido,
  no momento em que ele ocupa um assento numa mesa paga (criador incluso), e MUST impedir a entrada de
  qualquer jogador com saldo insuficiente.
- **FR-010**: O sistema MUST impedir qualquer jogador convidado (anônimo) de criar ou entrar numa mesa
  cujo valor de entrada seja maior que zero.
- **FR-011**: Ao final de uma mesa paga com um vencedor definido, o sistema MUST creditar ao vencedor o
  pote total (soma de todas as entradas pagas) menos uma taxa da casa (percentual configurável pelo
  admin), e MUST NOT alterar o saldo dos demais jogadores daquela mesa.
- **FR-012**: Se uma mesa paga for encerrada sem um vencedor (ex. abandonada/expirada antes do fim),
  o sistema MUST devolver a cada jogador exatamente o valor que ele pagou para entrar, sem reter taxa da
  casa nem gerar comissão de indicação.

**Indicação / afiliados**

- **FR-013**: O sistema MUST permitir que um jogador identificado escolha um código de indicação próprio
  e único, e MUST impedir que esse código seja alterado depois de definido.
- **FR-014**: O sistema MUST gerar, a partir do código de um jogador, um link de indicação que, quando
  usado por uma pessoa nova durante o cadastro, vincula permanentemente essa nova conta ao jogador que
  indicou.
- **FR-015**: O sistema MUST impedir que um jogador use o próprio código de indicação para se vincular a
  si mesmo.
- **FR-016**: Sempre que um jogador indicado jogar uma mesa paga dentro do período de vigência da sua
  indicação, o sistema MUST creditar ao indicador uma comissão igual a um percentual configurável pelo
  admin (referência: 20% a 30%) sobre a taxa da casa retida naquela mesa.
- **FR-017**: O período de vigência de uma indicação MUST ser de 12 meses a partir da criação da conta
  indicada; mesas pagas jogadas pelo indicado após esse período MUST NOT gerar comissão.
- **FR-018**: O sistema MUST impedir qualquer jogador convidado (anônimo) de definir ou usar um código de
  indicação.

**Identidade / cadastro**

- **FR-019**: O sistema MUST validar, em tempo real enquanto a pessoa digita durante o cadastro, se o
  nick escolhido já está em uso por outro jogador, e mostrar essa disponibilidade antes do envio do
  formulário.
- **FR-020**: O sistema MUST oferecer login/cadastro via conta Google como alternativa ao fluxo de
  e-mail/senha já existente, associando a conta Google à mesma identidade de jogador usada no resto da
  plataforma.
- **FR-021**: Compra de moedas, criação/entrada em mesa paga, e definição/uso de código de indicação
  MUST exigir uma conta identificada (e-mail/senha, Google, ou telefone) — nenhuma dessas ações MUST
  ficar disponível para uma sessão de convidado/anônima.

### Key Entities *(include if feature involves data)*

- **Carteira do jogador**: saldo atual de moedas de um jogador identificado; um jogador tem no máximo
  uma carteira.
- **Pacote de moedas**: um tier configurável pelo admin com preço em reais, quantidade de moedas
  entregues, e se está ativo para venda.
- **Pedido de compra**: uma solicitação de um jogador para comprar um pacote específico, com o
  comprovante anexado, seu estado (pendente/aprovado/rejeitado), quem revisou e quando.
- **Movimento de carteira**: um registro de cada alteração de saldo (crédito por aprovação de compra,
  débito por entrada em mesa, crédito por vitória em mesa, estorno por mesa abandonada, crédito por
  comissão de indicação), com motivo e referência à origem.
- **Mesa paga**: uma mesa de Cacheta (já existente) estendida com um valor de entrada em moedas e, ao
  final, o valor de taxa da casa retido daquela partida.
- **Código de indicação**: o código único escolhido por um jogador e o link gerado a partir dele.
- **Vínculo de indicação**: a relação entre um jogador indicador e um jogador indicado, com a data em que
  foi criada (usada para calcular o período de vigência de 12 meses).
- **Comissão de indicação**: um registro de cada valor gerado para um indicador a partir de uma mesa paga
  específica jogada por um indicado seu.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um jogador identificado consegue solicitar a compra de um pacote de moedas e enviar o
  comprovante em menos de 2 minutos.
- **SC-002**: Um admin consegue revisar e aprovar ou rejeitar um pedido de compra pendente em menos de 1
  minuto, sem precisar sair do painel administrativo.
- **SC-003**: 100% dos créditos de moedas correspondem exatamente a uma aprovação de pedido válida — não
  existe nenhum caminho que credite moedas sem uma aprovação registrada.
- **SC-004**: Em toda mesa paga finalizada com vencedor, o saldo final do vencedor mais a taxa retida
  pela casa mais a comissão de indicação (se houver) soma exatamente ao total das entradas pagas por
  todos os jogadores daquela mesa — nenhuma moeda é criada ou perdida no processo.
- **SC-005**: Um jogador consegue montar seu link de indicação e compartilhá-lo em menos de 1 minuto após
  escolher seu código.
- **SC-006**: Jogadores convidados continuam jogando treino e mesas online gratuitas sem nenhuma mudança
  perceptível de comportamento em relação ao que já existe hoje.

## Assumptions

- A chave Pix usada para receber os pagamentos é fixa e pertence à casa (ao operador da plataforma);
  cadastrá-la é uma configuração administrativa simples, não uma integração bancária.
- Não há reconciliação automática nem webhook de pagamento nesta fase — toda aprovação depende de um
  admin revisar o comprovante enviado pelo jogador manualmente. Isso implica uma janela de confiança: o
  sistema não consegue, por si só, provar que um comprovante é verdadeiro além do julgamento do admin.
- O percentual de taxa da casa sobre mesas pagas e o percentual de comissão de indicação são ambos
  configuráveis pelo admin (não fixos no código), mas um único valor global cada — não variam por
  jogador ou por mesa.
- O período de vigência de uma indicação é fixo em 12 meses, sem renovação automática.
- "Jogador identificado" significa qualquer jogador que tenha concluído login por e-mail/senha, telefone
  (OTP já existente) ou Google — qualquer um desses três métodos é suficiente para usar moedas, mesas
  pagas e indicação; não há hierarquia entre eles.
- Esta feature reaproveita a identidade de jogador já existente na plataforma (a mesma usada hoje para
  ranking, Cachetão e o jogo de Cacheta) — não cria um segundo cadastro paralelo.
- O layout de referência das imagens (`docs/telanick.png`, `docs/telanovousuario.png`,
  `docs/telaparceria.png`) serve só como inspiração de fluxo (nick com verificação em tempo real,
  split-screen, programa de indicação com código/link) — a identidade visual (cores, marca, textos) usa
  o design já existente do site, não a marca do produto de referência.
- Mesas gratuitas (valor de entrada zero) continuam funcionando exatamente como hoje, sem nenhuma
  restrição nova para jogadores convidados.
