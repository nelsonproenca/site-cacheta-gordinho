# PRD — Plataforma de Gestão de Cacheta ao Vivo (TikTok)

> Documento de requisitos de produto para consumo pelo Claude Code. Contém contexto de negócio, regras de domínio e especificação técnica suficiente para iniciar a implementação.

---

## 1. Contexto e problema

Um (ou mais) criador(es) de conteúdo fazem lives no TikTok jogando **Cacheta** (jogo de cartas). Durante a live, seguidores solicitam entrar via o recurso nativo do TikTok de participação em live. Cada partida jogada gera uma pontuação para o participante, que se acumula ao longo das semanas, formando um ranking.

Aos sábados ocorre um evento especial chamado **Cachetão**, que exige inscrição prévia durante a semana, com vagas limitadas (principais + suplentes). Adicionalmente, o produto deve suportar **campeonatos em formato "Copa do Mundo"** (fase de grupos + mata-mata) usando os seguidores/jogadores da base.

Hoje isso é controlado de forma manual/informal. O objetivo deste site é **profissionalizar a operação**: registrar partidas e pontuações, gerenciar inscrições do Cachetão, rodar campeonatos configuráveis, e gerenciar múltiplas contas de TikTok a partir de um único painel.

### 1.1 Restrição técnica fundamental (leia antes de implementar)

O TikTok **não oferece API pública para terceiros**:
- listarem participantes de uma live em tempo real (quem entrou pra jogar, resultado da partida);
- listarem a lista de seguidores de uma conta arbitrária;
- lerem métricas de engajamento de terceiros.

O TikTok Login Kit (OAuth oficial) permite apenas que **o próprio usuário** autorize o app a ler seu perfil básico (handle, avatar, contagem de seguidores dele mesmo) — não dá acesso à lista de seguidores de outra conta.

**Decisão de produto (definida com o stakeholder):** por isso, este PRD assume:
1. Resultados de partidas em live são **lançados manualmente** por um admin/moderador durante ou logo após a live, via painel simples e rápido de usar.
2. Não existe importação automática de seguidores do TikTok. Os "seguidores" viram **jogadores cadastrados na plataforma** (cadastro leve, sem senha — ver seção 4.1).
3. "Seguidores ativos" e "que mais interagem" **não são puxados do TikTok** — são **calculados internamente** a partir da atividade real na plataforma (partidas jogadas, participação em lives, inscrições no Cachetão, presença em campeonatos). Isso deve ficar claro na UI para não gerar expectativa de dado importado do TikTok.
4. Como evolução futura (fora do MVP), jogadores podem opcionalmente "Entrar com TikTok" (Login Kit) para verificar seu @ e ganhar um selo de perfil confirmado — reduz fraude/duplicidade, mas não resolve o problema de listar seguidores.

---

## 2. Personas

| Persona | Descrição | Acesso |
|---|---|---|
| **Super Admin** | Papel único e global (hoje só um e-mail), gerencia todas as contas e todos os admins da plataforma, independente de estar em `admin_account_access`. | Login completo, bypass total das checagens por conta. |
| **Streamer** | Dono da operação, gerencia uma ou mais contas TikTok, cria moderadores, configura regras de pontuação, cria Cachetão e campeonatos; é quem transmite a live oficial dentro da plataforma (Fase 5, ver 4.14). Equivale ao antigo "Owner". | Login completo (Supabase Auth), acesso a todas as contas TikTok que possui. |
| **Moderador** | Ajuda a lançar resultados de partidas durante a live, gerencia inscrições do Cachetão, modera o chat da live in-app (Fase 5, ver 4.15). Vinculado a um Streamer específico no cadastro (não a uma conta diretamente) e herda o mesmo acesso que esse Streamer tem no momento da aprovação; pode receber acesso extra a outras contas manualmente depois. | Login completo, acesso limitado por conta via `admin_account_access`. |
| **Jogador (seguidor)** | Participa das lives, se inscreve no Cachetão, acompanha seu ranking; a partir da Fase 5 pode comprar créditos, pagar taxa de entrada em partida/Cachetão, e assistir/conversar/mandar presente em lives dentro da plataforma. | Cadastro leve, sem senha, para o essencial (ver 4.1). **Login por código SMS obrigatório** (Fase 5) para qualquer ação que envolva crédito ou identidade verificada — comprar crédito, autoinscrição paga, assistir/comentar/mandar presente numa live in-app (ver 4.10–4.16). Site público mostra rankings e páginas do Cachetão sem necessidade de login. |
| **Visitante público** | Qualquer pessoa que acessa o site para ver rankings, resultados do Cachetão e chaves de campeonato. | Sem login. |

> **Nota de terminologia**: "Streamer"/"Moderador"/"Super Admin" (`admins.user_type` + `admins.is_super_admin`) é uma classificação de identidade da pessoa, escolhida no cadastro. Quem efetivamente autoriza leitura/escrita por conta continua sendo `admin_account_access.role` (`owner`/`moderator`, inalterado) — um Streamer aprovado vira `owner` da conta que cria; um Moderador aprovado recebe `moderator` nas mesmas contas do Streamer ao qual está vinculado, como snapshot no momento da aprovação.

---

## 3. Glossário de domínio

- **Lambreta**: vitória/derrota "especial" no jogo de cacheta (geralmente vale mais pontos que uma vitória/derrota normal — regra exata do jogo é do domínio do usuário, o sistema só precisa modelar o *tipo* de resultado).
- **Cachetão**: evento especial de sábado, com inscrição prévia obrigatória e vagas limitadas.
- **Principal**: inscrito confirmado para jogar o Cachetão.
- **Suplente**: inscrito em lista de espera, chamado caso um principal desista/falte.
- **Conta gerenciada**: uma conta TikTok cadastrada na plataforma (o "tenant" das lives, pontuações e Cachetão daquele streamer).
- **Temporada/semana**: janela de acumulação de pontos do ranking regular (resetável ou contínua, configurável).
- **Crédito**: unidade de saldo interno comprada com dinheiro real (Fase 5, via Mercado Pago), sem saque, usada para pagar taxa de inscrição em partida/Cachetão e presentes numa live in-app.
- **Carteira (wallet)**: saldo de créditos de um jogador ou de uma conta TikTok, com histórico auditável (ledger) de toda movimentação.
- **Meta**: objetivo individual do jogador (ex: nº de partidas, participações em live) que credita créditos automaticamente ao ser atingido.
- **Transmissão (live streaming in-app)**: live feita pelo streamer oficial de uma conta direto na plataforma (câmera própria, infra MediaMTX), assistida por jogadores logados.
- **Presente**: envio pago de créditos de um espectador logado para o streamer durante uma transmissão in-app, 1:1 sem taxa de plataforma.

---

## 4. Escopo funcional

### 4.1 Identidade do jogador

- Cadastro **leve, sem senha**: nome, @tiktok (obrigatório, único), WhatsApp (opcional).
- Jogador é uma entidade **global** na plataforma (um único cadastro), mas seu histórico de pontos, participações em lives, inscrições no Cachetão e campeonatos é sempre **por conta TikTok gerenciada** — o mesmo jogador pode acompanhar e pontuar em mais de um streamer gerenciado, com pontuações independentes por conta.
- Admin/moderador pode criar o cadastro do jogador diretamente (ex: durante a live, "adicionar rápido" por @) ou o próprio jogador se cadastra pelo site.
- Anti-duplicidade: unicidade por `tiktok_handle` (normalizado, case-insensitive, sem @).
- Campo `verified_via_tiktok` (boolean, default false) reservado para a fase futura de login via TikTok OAuth.
- **Login por SMS (Fase 5)**: além do cadastro leve acima, o jogador pode autenticar via **código OTP por SMS** (Supabase Auth, provider de telefone) para desbloquear ações que envolvem dinheiro ou identidade verificada — comprar crédito, autoinscrever-se pagando numa partida/Cachetão, assistir/comentar/mandar presente numa live in-app. `players` ganha `auth_user_id` (fk `auth.users`, nullable) e `auth_phone` (telefone verificado, único, separado do `whatsapp` solto já existente — que não é verificado). Ver 4.10.
- Cadastro/edição administrativa de jogador (feito por admin, sem o jogador logado) continua funcionando exatamente como hoje e não exige telefone verificado — só ações que o próprio jogador realiza logado exigem o OTP.

### 4.2 Gestão multiconta TikTok

- Um Owner pode cadastrar N contas TikTok (`tiktok_accounts`): handle, nome de exibição, avatar, status (ativa/inativa).
- Owner atribui moderadores a contas específicas (`admin_account_access`), com papel `owner` ou `moderator` por conta.
- Todo o restante do sistema (lives, pontuação, ranking, Cachetão, campeonatos) é sempre filtrado/escopado por `tiktok_account_id`.
- Troca de conta ativa no painel via seletor no topo (como um seletor de workspace).

### 4.3 Lives e pontuação

- Admin/moderador abre uma **sessão de live** (`live_sessions`) vinculada a uma conta TikTok, com data/hora.
- Durante a sessão, adiciona participantes (busca por @ existente ou cria jogador na hora).
- Para cada partida (`matches`), registra o resultado de cada participante envolvido, escolhendo um **tipo de resultado** pré-configurado (`scoring_rules`), que carrega os pontos.
- **Regras de pontuação são globais para toda a plataforma** (não por conta TikTok — mudou depois do MVP inicial), com valores padrão:
  - Vitória lambreta: **+3**
  - Vitória normal: **+2**
  - Derrota normal: **−1**
  - Derrota lambreta: **−3**
- Só o **Super Admin** pode criar novos tipos de resultado, editar valores ou ativar/desativar tipos — qualquer mudança afeta o jogo de todas as contas ao mesmo tempo, por isso não fica aberto a streamer/moderador comum. Todo mundo continua podendo usar (ler) as regras normalmente ao lançar resultado.
- Pontos se acumulam automaticamente no **ranking semanal** e no **ranking geral/temporada** da conta.
- Fechar uma sessão de live não bloqueia edição retroativa por admin (correção de lançamento incorreto), mas fica registrado log de alteração (auditoria simples: quem alterou, quando, valor anterior).

### 4.4 Ranking

- Ranking **semanal** (reseta a cada semana, definição de início de semana configurável — padrão segunda-feira) e ranking **acumulado da temporada** (janela configurável pelo admin, ex: "Temporada 2026.1" com data de início/fim).
- Critério de desempate configurável (padrão: maior nº de vitórias lambreta > maior saldo de pontos > ordem alfabética).
- Exibido publicamente por conta TikTok, sem necessidade de login.

### 4.5 Cachetão (evento de sábado)

- Admin cria um **evento Cachetão** (`cachetao_events`) vinculado a uma conta e a uma data (sábado).
- Configura o **período de inscrição** e o **critério de encerramento**, dos dois tipos, configurável por evento:
  - **Por tempo**: inscrições abrem em X e fecham automaticamente após N dias/horas.
  - **Por quantidade**: fecha automaticamente ao atingir `max_principais` inscritos confirmados; inscritos além desse limite (até `max_suplentes`) entram como suplentes automaticamente.
  - Os dois critérios podem coexistir (fecha no que ocorrer primeiro), configurável.
- Jogador se inscreve (auto-inscrição no site) ou admin inscreve manualmente.
- Fila de suplentes é ordenada por ordem de inscrição (FIFO); quando um principal cancela/falta, o sistema promove automaticamente o primeiro suplente e notifica (notificação no MVP pode ser apenas visual no painel; WhatsApp/e-mail fica para fase futura).
- Admin pode marcar manualmente presença/ausência no dia do evento.
- Resultados de partidas do Cachetão podem usar as mesmas `scoring_rules` da conta ou um conjunto específico marcado como "Cachetão" (configurável).

### 4.6 Campeonatos (formato Copa do Mundo)

- Admin cria um **campeonato** (`championships`) vinculado a uma conta, com configuração:
  - Quantidade de participantes (deve ser compatível com o formato de grupos escolhido).
  - Quantidade de grupos e tamanho de cada grupo (ex: 8 grupos de 4).
  - Quantos avançam por grupo para a fase eliminatória (ex: top 2).
  - Formato da fase eliminatória (oitavas, quartas, semi, final — gerado automaticamente a partir de quem avança).
  - Forma de sorteio dos grupos: aleatório ou seed manual pelo admin.
- Participantes são selecionados a partir da base de jogadores da conta (podem ser convidados/inscritos, reaproveitando o mesmo fluxo de inscrição leve do Cachetão).
- Cada partida de grupo/mata-mata é lançada manualmente pelo admin (placar ou vencedor, dependendo da configuração do jogo), e o sistema:
  - Atualiza a tabela de classificação do grupo automaticamente (pontos, saldo, critério de desempate configurável).
  - Ao fechar a fase de grupos, gera automaticamente o chaveamento da fase eliminatória com os classificados.
  - Avança vencedores rodada a rodada até a final, gerando um **campeão**.
- Página pública do campeonato mostra grupos, tabela de classificação e chaveamento ao vivo (atualiza conforme admin lança resultados).

### 4.7 Seguidores ativos / engajamento (calculado internamente)

- Não há importação da lista real de seguidores do TikTok (ver seção 1.1).
- O sistema calcula, por conta TikTok e por período configurável:
  - **Jogadores mais ativos**: ranking por nº de participações em lives + partidas jogadas.
  - **Jogadores mais engajados**: score combinando frequência de participação em lives, inscrições no Cachetão (mesmo que não jogue), e participação em campeonatos.
- Esses dados alimentam, por exemplo, priorização de quem chamar para o Cachetão ou destaque de "fã da semana".

### 4.8 Partidas (confrontos entre jogadores)

- Fora do lançamento de resultado por jogador já descrito em 4.3, admin/moderador pode montar explicitamente um **confronto** entre 2 jogadores nomeados ("Jogador 1 vs Jogador 2"). **Partidas é uma área própria do menu lateral, independente de estar dentro de uma conta específica** — não existe mais "minha conta" implícita como um dos dois lados; os dois lados são escolhidos do mesmo jeito, simetricamente. Dois subitens:
  - **Nova Partida**: escolhe, dos dois lados, uma **conta cadastrada na plataforma** (não mais "um streamer" — direto pela conta, o que já é inequívoco mesmo pra quem tem mais de uma) e um jogador da live aberta dela (a live é trazida automaticamente quando a conta só tem uma aberta). Assim que os dois lados têm um jogador escolhido, um botão "Adicionar jogadores à partida" monta o confronto. Logo abaixo, aparece a lista de confrontos já montados entre essas duas lives (colunas Jogador 1, Jogador 2, Opções) — cada jogador pode ser **trocado** por outro participante da mesma live (abre um modal com a lista pra escolher) sem precisar remover e recriar o confronto inteiro; um confronto também pode ser **removido** por completo (exclusão física, não soft-delete) e recriado do zero.
  - **Jogar**: lista as partidas mais recentes que o admin logado tem acesso (de qualquer um dos dois lados) — abre a tela de execução ("Desafio dos Influencers", ver abaixo).
- Confronto entre 2 contas de **streamers diferentes**: **não conta pontos em nenhum ranking** (nem de uma conta, nem da outra) — isolado do ranking regular, mesmo espírito de isolamento já aplicado ao Cachetão (4.5), só que mais estrito.
- **"Desafio dos Influencers" (tela de execução, acessada por "Jogar")**: todos os confrontos já montados entre duas lives específicas formam um **desafio**. A tela mostra: data, as duas contas, e a **contagem de vitórias** (1 por confronto vencido — não é soma de pontos), mais a lista de confrontos com Jogador 1, Jogador 2, Resultado e uma coluna **Pontos**: um select com as `scoring_rules` da conta de quem venceu aquele confronto específico; ao escolher uma pontuação, um modal de confirmação ("Deseja salvar esse resultado?") evita lançamento acidental antes de gravar. Mesmo assim, **nada disso soma em ranking algum** — a contagem de vitórias e a pontuação lançada por confronto são só informativas dentro da área de Partidas.
- Pareamento de 2 jogadores **dentro da mesma conta** (ex: dois jogadores da mesma live, ou do mesmo Cachetão) continua existindo como mecanismo separado, acessado a partir da própria tela do evento/conta — não passou por essa reformulação.

### 4.9 Notificações entre admins

- Admin/moderador pode notificar outro **streamer** diretamente — mensagem simples de texto, sem canal externo (nada de WhatsApp/e-mail aqui, isso é só para a fase de suplente chamado, 4.5/Fase 4). O gatilho original era o botão "Iniciar partida" na tela de montar confronto; esse botão foi removido quando Partidas virou uma área global e ainda não tem um novo lugar definido — a notificação em si continua funcionando, só falta decidir onde ela entra no fluxo novo.
- O ícone de notificações fica disponível na barra superior do site assim que o usuário está logado (antes disso, mostra o link de acesso ao painel), com indicador de não lidas.

### 4.10 Créditos e carteira (Fase 5)

- Jogadores compram créditos com dinheiro real via **Mercado Pago** (Pix/cartão), sem possibilidade de saque — o crédito só é gasto dentro da plataforma.
- Cada jogador e cada conta TikTok gerenciada tem uma **carteira** com saldo em créditos; todo movimento de saldo gera uma linha auditável no histórico (tipo do movimento, valor, saldo resultante, referência externa quando aplicável).
- Tipos de movimento: compra, taxa de entrada em Cachetão, taxa de entrada em partida normal, presente enviado/recebido, prêmio de meta, ajuste manual (Super Admin).
- Saldo nunca é alterado diretamente por uma escrita de cliente — toda variação passa por uma rotina interna atômica que garante que o saldo nunca fica negativo, mesmo sob ações concorrentes.
- Super Admin pode fazer ajuste manual de saldo (suporte ao jogador; também usado para testar o restante da funcionalidade antes do Mercado Pago estar integrado).

### 4.11 Compra de crédito (Mercado Pago)

- Catálogo de pacotes de crédito, cadastrado pelo Super Admin (mesmo padrão de `scoring_rules`: leitura pública, escrita só Super Admin).
- Fluxo: jogador logado escolhe um pacote → checkout do Mercado Pago (Checkout Pro) → confirmação via webhook, que busca o pagamento de verdade na API do Mercado Pago (nunca confia só no corpo recebido) e credita o saldo de forma **idempotente** — reprocessar a mesma notificação não duplica crédito.
- Caminho de reconciliação que não depende só do webhook: se o jogador retorna à página de confirmação e o webhook ainda não chegou, o sistema confere o pagamento diretamente na API do Mercado Pago e credita mesmo assim.

### 4.12 Metas (recompensas automáticas)

- Metas são **individuais por jogador** (não por conta), configuradas pelo Super Admin: métrica-alvo (ex: nº de partidas jogadas, participações em live), valor-alvo, escopo (vida toda / período de pontuação / evento) e prêmio em créditos.
- Ao bater uma meta, o crédito é **creditado automaticamente e instantaneamente**, sem ação manual de admin — disparado no momento em que o resultado/inscrição que completa a meta é registrado.
- Cada combinação de (meta, jogador, escopo) só paga uma vez.

### 4.13 Taxa de entrada em Cachetão e em partida normal

- **Cachetão**: cada evento pode ter uma taxa de inscrição em créditos (0 = grátis, comportamento atual preservado). A autoinscrição do próprio jogador debita o crédito no ato; se o débito falhar, a inscrição é desfeita. Cadastro manual feito por admin (jogador não logado) fica isento da taxa por padrão.
- **Partida normal (novo em relação a 4.3/4.8)**: hoje toda partida é montada por um admin escolhendo dois participantes já presentes numa live — não existe autoinscrição paga aqui. Isso passa a existir: uma live aberta pode ter uma taxa de entrada opcional; um jogador logado se autoinscreve pagando essa taxa, e a inscrição entra diretamente como participante da live — a mesma lista que o admin já usa para montar confrontos (4.8) —, sem exigir nenhuma mudança nas telas existentes de montagem de partida.
- Em ambos os casos é **taxa de inscrição consumida**, não aposta — não existe "vencedor leva tudo".

### 4.14 Live streaming in-app

- Só o **streamer oficial** de uma conta (dono/moderador com acesso à conta) pode transmitir — é uma ação administrativa, não algo que qualquer jogador faz.
- Infraestrutura: **MediaMTX**, já rodando na VPS do usuário (a mesma instância que atende um produto de câmeras do usuário, "Watchtower" — não é uma instância dedicada) — RTMP de entrada (fallback OBS) e WebRTC nativo (WHIP/WHEP) para o streamer publicar e o espectador assistir direto no navegador, sem plugin.
- Jogador precisa estar logado (via SMS, 4.10) para assistir — sem vitrine pública anônima para transmissões ao vivo.
- **Modelo de segurança do path**: no MediaMTX, publicar (WHIP) e assistir (WHEP) usam a mesma URL baseada em path — diferente do desenho original que assumia SRS (onde dava pra separar os dois). O jogador só recebe esse path ao abrir a página de uma transmissão específica (nunca na listagem pública), e só depois que ela já está `ao vivo` de verdade — a proteção real contra um espectador tentar "roubar" o path fica por conta do MediaMTX só aceitar um publisher por vez naquele path.

### 4.15 Chat da live

- Jogadores logados conversam em tempo real durante a transmissão.
- Moderação (apagar mensagem, silenciar espectador) reaproveita os **moderadores que a conta já tem** (`admin_account_access`, papel owner/moderator) — não é um conceito novo de "moderador de live".

### 4.16 Presentes pagos

- Durante uma transmissão, um espectador logado pode mandar um presente pago (catálogo público de presentes, cadastrado pelo Super Admin) usando créditos da própria carteira.
- Transferência é **1:1, sem taxa da plataforma** — o streamer recebe o valor cheio em créditos na carteira da conta que está transmitindo.

---

## 5. Não-objetivos (fora de escopo do MVP)

- Captura automática de eventos da live do TikTok (sem API oficial para isso).
- Importação real da lista de seguidores/engajamento do TikTok.
- App mobile nativo (o site deve ser responsivo/mobile-first, mas não é um app).
- Notificações via WhatsApp/e-mail automatizadas para suplente chamado (planejar para fase futura) — não confundir com o SMS usado como **login** de jogador (Fase 5, ver 4.10), que é autenticação, não notificação.
- **Saque de crédito comprado** — crédito é gasto só dentro da plataforma, nunca convertido de volta em dinheiro (Fase 5).
- **Apostas / "vencedor leva tudo"** — toda cobrança em crédito (taxa de partida/Cachetão) é uma taxa de inscrição consumida, não uma aposta com prêmio ao vencedor (Fase 5).

> Nota: "Pagamentos, prêmios em dinheiro, ou qualquer transação financeira" era um não-objetivo do MVP original — deixou de ser válido a partir da Fase 5 (Créditos), que introduz dinheiro real via Mercado Pago dentro dos limites acima (sem saque, sem aposta).

---

## 6. Roadmap por fases

**Fase 1 — MVP**
- Multiconta TikTok + admins/moderadores com permissão por conta.
- Cadastro leve de jogadores.
- Lançamento manual de lives, partidas e pontuação configurável.
- Ranking semanal e de temporada, público.

**Fase 2 — Cachetão**
- Criação de eventos, inscrição (principal/suplente), encerramento por tempo/quantidade, fila de suplentes automática.

**Fase 3 — Campeonatos**
- Criação de campeonatos configuráveis, grupos, classificação automática, mata-mata, página pública de chaveamento.

**Fase 4 — Engajamento e verificação**
- Cálculo de jogadores mais ativos/engajados.
- Login "Entrar com TikTok" (Login Kit) para selo de verificado.
- Notificações (WhatsApp/e-mail) para suplentes chamados.

**Fase 5 — Créditos, Metas e Live Streaming in-app**

Marcos incrementais, cada um testável e "shippável" isoladamente (M6–M8 dependem só de M0; M5–M8 dependem de M1 — dá para paralelizar "Créditos" com "Live" depois que M0 sair):
- **M0 — Login de jogador**: OTP por SMS via Supabase Auth (pré-requisito de todo o resto da fase).
- **M1 — Carteira de créditos**: ledger interno + débito/crédito atômico + ajuste manual (Super Admin), sem dinheiro real ainda.
- **M2 — Compra via Mercado Pago**: Checkout Pro + webhook + confirmação idempotente.
- **M3 — Metas**: catálogo + crédito automático ao bater a meta.
- **M4 — Taxa de entrada no Cachetão** (autoinscrição já existe, ganha um débito).
- **M5 — Autoinscrição paga em partida normal** (fluxo novo, ver 4.13).
- **M6 — Live streaming in-app**: infra MediaMTX, tela de "ir ao vivo" para o streamer, player para o espectador.
- **M7 — Chat da live**.
- **M8 — Presentes pagos**.

---

## 7. Modelo de dados (proposto)

> Nomenclatura de tabelas/campos em inglês (convenção técnica); textos de produto/UI em português. Tipos ilustrativos (Postgres/Supabase).

```
admins
  id uuid pk
  name text
  email text unique
  status text check (status in ('pending','approved'))
  is_super_admin boolean default false
  user_type text check (user_type in ('streamer','moderador')) nullable  -- nullable p/ super admin
  streamer_id uuid fk -> admins.id nullable                              -- só p/ user_type='moderador'
  created_at timestamptz

tiktok_accounts
  id uuid pk
  handle text unique
  display_name text
  avatar_url text
  is_active boolean default true
  created_at timestamptz

admin_account_access
  admin_id uuid fk -> admins.id
  tiktok_account_id uuid fk -> tiktok_accounts.id
  role text check (role in ('owner','moderator'))
  primary key (admin_id, tiktok_account_id)

players
  id uuid pk
  display_name text
  tiktok_handle text unique  -- normalizado, sem @, lowercase
  whatsapp text nullable
  verified_via_tiktok boolean default false
  auth_user_id uuid unique fk -> auth.users(id) nullable   -- Fase 5, login por SMS
  auth_phone text unique nullable                           -- telefone verificado via OTP, separado do whatsapp
  created_at timestamptz

scoring_rules              -- global, não por conta (mudou depois do MVP inicial — só Super Admin escreve)
  id uuid pk
  name text                 -- ex: "Vitória lambreta"
  points integer            -- ex: 3, -1, -3
  is_active boolean default true
  created_at timestamptz

live_sessions
  id uuid pk
  tiktok_account_id uuid fk
  session_date date
  status text check (status in ('open','closed'))
  notes text nullable
  self_registration_fee_credits integer nullable   -- Fase 5; null = autoinscrição paga desligada
  created_by uuid fk -> admins.id
  created_at timestamptz

live_participants
  id uuid pk
  live_session_id uuid fk
  player_id uuid fk
  joined_at timestamptz

matches
  id uuid pk
  live_session_id uuid fk nullable      -- null se for partida do Cachetão/campeonato
  cachetao_event_id uuid fk nullable
  championship_match_id uuid fk nullable
  player_a_id uuid fk -> players.id nullable   -- pareamento de "partida" (4.8); null nas partidas de 1 jogador só
  player_b_id uuid fk -> players.id nullable
  played_at timestamptz

cross_account_matches      -- confronto entre streamers diferentes (4.8); nunca soma ranking
  id uuid pk
  account_id uuid fk -> tiktok_accounts.id              -- lado de quem monta o confronto
  live_session_id uuid fk -> live_sessions.id
  player_id uuid fk -> players.id
  opponent_account_id uuid fk -> tiktok_accounts.id     -- lado do outro streamer
  opponent_live_session_id uuid fk -> live_sessions.id
  opponent_player_id uuid fk -> players.id
  winner text check (winner in ('player','opponent')) nullable
  scoring_rule_id uuid fk -> scoring_rules.id nullable   -- regra da conta de quem venceu; sem cascade (histórico)
  points_awarded integer nullable                        -- snapshot, mesma razão de match_results.points_awarded
  created_by uuid fk -> admins.id
  created_at timestamptz

notifications               -- notificação simples admin-para-admin (4.9)
  id uuid pk
  recipient_admin_id uuid fk -> admins.id
  sender_admin_id uuid fk -> admins.id nullable
  message text
  is_read boolean default false
  created_at timestamptz

match_results
  id uuid pk
  match_id uuid fk
  player_id uuid fk
  scoring_rule_id uuid fk
  points_awarded integer          -- snapshot do valor no momento (histórico não muda se a regra for editada depois)
  recorded_by uuid fk -> admins.id
  created_at timestamptz

score_periods            -- semanas/temporadas configuráveis
  id uuid pk
  tiktok_account_id uuid fk
  type text check (type in ('week','season'))
  label text               -- ex: "Semana 03/2026", "Temporada 2026.1"
  starts_at date
  ends_at date

cachetao_events
  id uuid pk
  tiktok_account_id uuid fk
  event_date date            -- sábado
  registration_opens_at timestamptz
  registration_closes_at timestamptz nullable   -- regra "por tempo"
  max_principals integer nullable               -- regra "por quantidade"
  max_substitutes integer nullable
  close_rule text check (close_rule in ('time','count','both'))
  status text check (status in ('scheduled','registrations_open','registrations_closed','in_progress','finished'))
  entry_fee_credits integer not null default 0    -- Fase 5; 0 = grátis (comportamento atual preservado)

cachetao_registrations
  id uuid pk
  cachetao_event_id uuid fk
  player_id uuid fk
  registration_type text check (registration_type in ('principal','substitute'))
  queue_position integer nullable     -- ordem entre suplentes
  status text check (status in ('confirmed','called_up','cancelled','no_show'))
  registered_at timestamptz

championships
  id uuid pk
  tiktok_account_id uuid fk
  name text
  num_groups integer
  group_size integer
  advance_per_group integer
  draw_method text check (draw_method in ('random','manual_seed'))
  status text check (status in ('draft','registration','group_stage','knockout','finished'))
  created_at timestamptz

championship_participants
  id uuid pk
  championship_id uuid fk
  player_id uuid fk
  group_id uuid fk nullable
  seed integer nullable

championship_groups
  id uuid pk
  championship_id uuid fk
  name text            -- "Grupo A"

championship_matches
  id uuid pk
  championship_id uuid fk
  group_id uuid fk nullable         -- null se for fase eliminatória
  stage text check (stage in ('group','round_of_16','quarter_final','semi_final','final'))
  round_number integer nullable
  player_a_id uuid fk
  player_b_id uuid fk
  score_a integer nullable
  score_b integer nullable
  winner_id uuid fk nullable
  status text check (status in ('scheduled','in_progress','finished'))
  played_at timestamptz nullable

engagement_snapshots
  id uuid pk
  tiktok_account_id uuid fk
  player_id uuid fk
  period_start date
  period_end date
  live_participations_count integer
  matches_played_count integer
  cachetao_participations_count integer
  championship_participations_count integer
  computed_at timestamptz

credit_wallets                -- Fase 5; saldo de créditos de um jogador OU de uma conta (exatamente um dos dois)
  id uuid pk
  player_id uuid fk -> players.id nullable
  tiktok_account_id uuid fk -> tiktok_accounts.id nullable
  balance integer not null default 0 check (balance >= 0)
  created_at timestamptz

credit_ledger                 -- Fase 5; histórico auditável de toda movimentação de saldo
  id uuid pk
  wallet_id uuid fk -> credit_wallets.id
  type text check (type in ('purchase','cachetao_entry_fee','live_entry_fee','gift_sent','gift_received','meta_reward','admin_adjustment'))
  amount integer                       -- positivo ou negativo
  balance_after integer
  reference_type text nullable
  reference_id uuid nullable           -- ex: id da compra no Mercado Pago, id da inscrição
  counterparty_ledger_id uuid fk -> credit_ledger.id nullable   -- liga o débito de quem manda ao crédito de quem recebe
  created_at timestamptz

credit_packages               -- Fase 5; catálogo público, escrita só is_super_admin (mesmo padrão de scoring_rules)
  id uuid pk
  name text
  credits integer
  price_cents integer
  is_active boolean default true

credit_purchases              -- Fase 5; uma compra de crédito via Mercado Pago
  id uuid pk
  player_id uuid fk -> players.id
  credit_package_id uuid fk -> credit_packages.id
  credits_snapshot integer
  price_cents_snapshot integer
  status text check (status in ('pending','approved','rejected','expired'))
  mp_payment_id text unique nullable
  external_reference text
  created_at timestamptz

player_metas                  -- Fase 5; catálogo público, escrita só is_super_admin
  id uuid pk
  name text
  metric text                   -- ex: partidas jogadas, participações em live
  target_value integer
  scope text check (scope in ('lifetime','score_period','event'))
  reward_credits integer
  is_active boolean default true

player_meta_completions       -- Fase 5; uma linha por (meta, jogador, escopo) — impede pagar a mesma meta 2x
  id uuid pk
  player_meta_id uuid fk -> player_metas.id
  player_id uuid fk -> players.id
  scope_reference_id uuid nullable     -- id do score_period/evento quando o escopo não é lifetime
  completed_at timestamptz

live_broadcasts                -- Fase 5; transmissão in-app do streamer oficial de uma conta
  id uuid pk
  tiktok_account_id uuid fk -> tiktok_accounts.id
  started_by uuid fk -> admins.id
  stream_key text
  srs_stream_id text
  status text check (status in ('created','live','ended'))
  title text nullable
  started_at timestamptz nullable
  ended_at timestamptz nullable
  created_at timestamptz

live_chat_messages             -- Fase 5
  id uuid pk
  live_broadcast_id uuid fk -> live_broadcasts.id
  player_id uuid fk -> players.id
  body text
  deleted_at timestamptz nullable
  created_at timestamptz

gift_catalog                   -- Fase 5; catálogo público, escrita só is_super_admin
  id uuid pk
  name text
  credits_cost integer
  icon_url text nullable
  is_active boolean default true

live_gift_events               -- Fase 5
  id uuid pk
  live_broadcast_id uuid fk -> live_broadcasts.id
  sender_player_id uuid fk -> players.id
  gift_catalog_id uuid fk -> gift_catalog.id
  credits_cost integer            -- snapshot
  created_at timestamptz
```

**Observações de modelagem:**
- `match_results.points_awarded` é um snapshot (não recalcula retroativamente se `scoring_rules.points` mudar depois) — preserva histórico correto.
- Rankings semanais/de temporada podem ser **calculados via query** (`SUM(points_awarded)` agrupado por `player_id` + `score_period`) em vez de tabela materializada no MVP; considerar view materializada ou tabela de cache (`weekly_score_cache`) apenas se performance exigir.
- RLS (Row Level Security) do Supabase deve restringir escrita em `live_sessions`, `matches`, `match_results`, `cachetao_*`, `championship_*` a admins com acesso à `tiktok_account_id` correspondente (via `admin_account_access`). Leitura pública (`select`) liberada para dados de ranking/resultados/chaveamento.
- `cross_account_matches` é intencionalmente **separada** de `matches`/`match_results`: como um confronto entre streamers diferentes nunca deve contar em ranking nenhum, e `matches` exige uma única `tiktok_account_id` dona por linha, isolar numa tabela à parte (nunca lida pelas queries de ranking) evita depender de um filtro que precisaria ser lembrado toda vez.
- `scoring_rules` é a única exceção à regra "escrita liberada pra quem tem `admin_account_access` na conta": por ser global (afeta todas as contas de uma vez), a escrita é restrita a `is_super_admin()`, não a `has_account_access()`.
- **Créditos (Fase 5)**: `credit_wallets.balance` nunca é escrito diretamente por cliente — como `points_awarded`/o restante do schema já faz para dados sensíveis, toda variação passa por uma rotina interna atômica, sem policy de insert/update direta. `credit_ledger` é o equivalente, para dinheiro, do log de alteração já mencionado em 4.3 para pontuação — histórico auditável, nunca reescrito.
- `credit_packages`, `player_metas` e `gift_catalog` seguem o mesmo padrão de `scoring_rules`: catálogo de leitura pública, escrita restrita a `is_super_admin()`.

---

## 8. Arquitetura técnica

- **Frontend/Backend**: Next.js (App Router), TypeScript, React Server Components + Server Actions para mutações administrativas.
- **Banco de dados / Auth**: Supabase (Postgres gerenciado, Supabase Auth para login de admin/moderador via e-mail+senha ou magic link, RLS para autorização por conta).
- **Hospedagem**: Vercel (deploy do Next.js), Supabase como serviço gerenciado à parte.
- **Estilo/UI**: Tailwind CSS, implementando os tokens definidos em `assets/ferrari-design-system.html` (ver seção 9).
- **Validação**: Zod para schemas de formulário e de server actions.
- **Idioma**: interface 100% em pt-BR; timezone padrão America/Sao_Paulo.
- **Mobile-first**: público majoritário acessa via link do TikTok pelo celular — priorizar performance e usabilidade mobile antes de desktop.
- **Pagamento (Fase 5)**: Mercado Pago (SDK `mercadopago`, Checkout Pro) para compra de créditos; webhook validado + confirmação idempotente, nunca confiando só no corpo recebido.
- **Autenticação de jogador (Fase 5)**: Supabase Auth, provider de telefone (OTP por SMS) — provedor de SMS recomendado: Twilio.
- **Streaming (Fase 5)**: MediaMTX, já rodando na VPS do usuário (compartilhada com outro produto do usuário, um sistema de câmeras) — RTMP de entrada, WHIP/WHEP para publish/playback no navegador, atrás de um subdomínio nginx+TLS dedicado (o navegador bloqueia `fetch()` http:// a partir do site https://).
- **Chat e eventos em tempo real (Fase 5)**: Supabase Realtime (já incluso no `@supabase/supabase-js`), para chat da live e eventos de presente.

### 8.1 Estrutura de pastas sugerida

```
/app
  /(public)
    /[accountHandle]/ranking/page.tsx
    /[accountHandle]/cachetao/page.tsx
    /[accountHandle]/campeonatos/[id]/page.tsx
    /[accountHandle]/inscricao/page.tsx        -- auto-inscrição de jogador
  /(admin)
    /admin/login/page.tsx
    /admin/[accountId]/lives/page.tsx
    /admin/[accountId]/lives/[sessionId]/page.tsx
    /admin/[accountId]/pontuacao/page.tsx       -- CRUD scoring_rules
    /admin/[accountId]/cachetao/page.tsx
    /admin/[accountId]/campeonatos/page.tsx
    /admin/[accountId]/jogadores/page.tsx
    /admin/contas/page.tsx                      -- gestão multiconta (owner)
/lib
  /supabase (client, server, middleware)
  /scoring (cálculo de ranking, desempate)
  /cachetao (regras de fila/suplente)
  /championship (geração de grupos, sorteio, avanço de fases)
/components
  /ui (botões, cards, badges, tabela — baseados no design system)
```

### 8.2 Variáveis de ambiente

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       -- apenas server-side, nunca exposto ao client
NEXT_PUBLIC_SITE_URL=

# Fase 5 — Créditos e Live Streaming
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=
MEDIAMTX_PUBLIC_URL=
MEDIAMTX_RTMP_HOST=
MEDIAMTX_CALLBACK_SECRET=
```

---

## 9. Identidade visual

Base: `assets/ferrari-design-system.html` (tema "Rosso Corsa" — vermelho de corrida, preto carbono, amarelo como destaque, tipografia condensada em itálico para títulos, monoespaçada para dados numéricos).

Reaproveitar diretamente os **tokens** (`:root` do arquivo: cores, fontes, radius) e os seguintes **componentes**, reinterpretando o vocabulário de "corrida" para "cacheta":

| Componente do design system | Uso no site de cacheta |
|---|---|
| `.card-driver` (nº do piloto, nome, barra de performance) | Card de jogador no ranking (nº da posição, nome, @tiktok, barra de pontos) |
| `.card-race` (rodada, nome, meta) | Card de partida/rodada do Cachetão ou campeonato |
| `.table-wrap` / standings table | Tabela de ranking semanal/temporada e classificação de grupo |
| `.badge-*` | Status: `Confirmado` (verde), `Suplente` (amarelo), `Eliminado` (vermelho), `Campeão` (roxo/dourado) |
| `.btn-primary` / `.btn-yellow` | Ações primárias (inscrever-se, lançar resultado) vs. destaque (campeão, chamada de suplente) |
| `.chart-card` / gauge | Painel de engajamento (jogador mais ativo, gráfico de pontos ao longo das semanas) |
| `lights-rig` (luzes de largada) | Elemento decorativo de hero — pode virar contagem regressiva para abertura/fechamento de inscrição do Cachetão |

Cores semânticas já definidas no arquivo (`--green` para positivo, `--red-bright` para negativo/derrota, `--yellow` para destaque) mapeiam bem para pontuação positiva/negativa — reaproveitar tal como está.

---

## 10. Métricas de sucesso

- Tempo médio para lançar o resultado de uma partida durante a live (meta: < 15s por lançamento, painel deve ser otimizado para velocidade).
- % de inscrições do Cachetão preenchidas dentro do prazo (principais completos antes do fechamento).
- Nº de jogadores cadastrados / retenção semana a semana no ranking.
- Uso do painel multiconta por moderadores sem intervenção do owner.

---

## 11. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Erro de lançamento manual durante a live (pressa) | Painel com atalhos rápidos, undo/edição pós-live com auditoria. |
| Fraude/duplicidade de @tiktok no cadastro leve | Unicidade de handle + selo de verificado via TikTok OAuth na Fase 4. |
| Ausência de API TikTok limita automação | Expectativa alinhada com o stakeholder (este PRD); todo dado de TikTok é manual ou autodeclarado. |
| Picos de acesso durante live (muitos acessos simultâneos ao ranking público) | Páginas públicas como Server Components com cache/revalidate curto (ex: revalidate a cada 5-10s) em vez de realtime puro. |
| Fraude/erro em pagamento real (Mercado Pago, Fase 5) | Nunca confiar no corpo do webhook — sempre buscar o pagamento de verdade na API antes de confirmar; confirmação idempotente por `mp_payment_id`. |
| Corrida em débito de crédito — duas ações simultâneas gastando o mesmo saldo (Fase 5) | Débito/crédito sempre via rotina atômica que checa saldo suficiente na mesma instrução SQL, sem depender de lock explícito; saldo nunca fica negativo. |
| MediaMTX não tem ambiente de sandbox (Fase 5) | Testar com um publisher real (navegador/OBS) contra a VPS real antes de qualquer usuário real transmitir. |
| A VPS de streaming já roda outro produto do usuário (câmeras) em produção (Fase 5) | Toda mudança de config (`mediamtx.yml`, nginx, firewall) é aditiva — path novo (`~^live_`), subdomínio novo, porta nova — sem tocar nos paths/sites já existentes das câmeras. |

---

## 12. Decisões em aberto (revisitar com o stakeholder)

- Regras exatas de desempate no ranking (além do padrão sugerido).
- Se o Cachetão usa exatamente as mesmas `scoring_rules` das lives normais ou um conjunto próprio.
- Notificação de suplente chamado (canal: WhatsApp? apenas painel?) — fica para Fase 4.
- Se haverá necessidade futura de exportar dados (CSV) para uso externo.
- A tela de execução de confrontos entre streamers (4.8) já lança pontuação por confronto (`scoring_rule_id`/`points_awarded`) e conta vitórias — mas isso continua isolado de qualquer ranking por decisão explícita; falta definir se algum dia esses confrontos devem passar a valer pra algum ranking (regular ou um ranking próprio de "desafios").
- **(Fase 5)** Cadastro manual de jogador feito pelo admin (sem o jogador logado) num Cachetão pago fica isento da taxa por padrão — só a autoinscrição do próprio jogador paga; confirmar se é o comportamento esperado.
- **(Fase 5, resolvido)** A infra de streaming da VPS acabou sendo **MediaMTX**, não SRS como o plano original assumia — e essa mesma instância já roda outro produto do usuário (câmeras). Hooks `runOnReady`/`runOnNotReady` (não `on_publish`/`on_unpublish`, que não existem no MediaMTX; nem `runOnAvailable`/`runOnUnavailable`, nomes de uma versão mais nova que a v1.9.3 rodando na VPS) confirmados contra a versão real instalada.
- **(Fase 5, resolvido)** Chat da live usa **Realtime `postgres_changes`** (respeita RLS nativamente), não Broadcast/Presence — por isso a disponibilidade de "Realtime Authorization" nunca precisou ser confirmada, decisão que evita a questão inteira.
