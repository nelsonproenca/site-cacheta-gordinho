---
name: "regras-cacheta"
description: "Regras oficiais do jogo de cartas Cacheta (fonte: supercacheta.com.br), para consulta antes de mexer em lib/cacheta/, supabase/migrations/*cacheta*.sql, ou qualquer lógica de combinação/pontuação do jogo. Use sempre que for implementar, revisar ou depurar o motor de regras do Cacheta (bater, trinca, sequência, coringa, pontuação) neste repositório."
metadata:
  author: "claude"
  source: "https://supercacheta.com.br/cacheta/regras-oficiais-da-cacheta/"
user-invocable: false
disable-model-invocation: false
---

# Regras oficiais da Cacheta

Transcrição das regras oficiais (fonte acima), para consulta antes de alterar `lib/cacheta/rules.ts`,
`lib/cacheta/cards.ts`, ou qualquer migration de `supabase/migrations/*cacheta*.sql`. **Ver a seção
"Divergências da implementação atual" no fim — a versão jogável deste repositório (`specs/001-cacheta-jogo-online/`)
já diverge das regras oficiais em pontos específicos, documentados e conscientes; não "corrigir"
silenciosamente sem confirmar com o usuário primeiro.**

## Configuração e distribuição

- 2 a 4 jogadores na Cacheta padrão (2 a 9 no modo Cachetão).
- 2 baralhos franceses completos = **108 cartas** (104 normais + **4 coringas tradicionais impressos**).
- 9 cartas por jogador, distribuídas uma por vez, sentido horário.
- **Vira**: a carta virada do monte, fica separada e fora de jogo durante toda a rodada.
- **Coringa da rodada**: a carta de valor imediatamente superior à vira, **mesmo naipe**. Ex.: vira 5 de
  Copas → coringa é o 6 de Copas (só essa carta específica, não "todo 6" nem "mesma cor").
- O jogador à esquerda do distribuidor começa.

## Turno

1. **Compra (obrigatória)**: do topo do monte, ou a última carta descartada visível.
2. **Organização (livre)**: arrumar a mão nas combinações.
3. **Descarte (obrigatório)**: 1 carta, fica visível ao próximo. Proibido descartar a carta que acabou de
   comprar do descarte.
4. **Bater (opcional)**: declarar ao completar as combinações; a rodada termina na hora; a disposição das
   cartas é final assim que declarado.

## Combinações para bater

- Exatamente **3 combinações**, cada uma com **no mínimo 3 cartas**, sem limite máximo.
- **Trinca**: 3+ cartas de mesmo valor, naipes diferentes.
- **Sequência**: 3+ cartas consecutivas do mesmo naipe. Ás pode abrir (A-2-3) mas não fechar (Q-K-A); não
  passa de K para A.
- Qualquer mistura de trincas/sequências é válida, desde que sejam exatamente 3 combinações no total.
- Para uma mão de **9 cartas**, a única forma aritmética de dividir em 3 grupos de ≥3 cartas é **3+3+3**
  — grupos maiores só aparecem no "bater com 10" (ver abaixo), onde 10 cartas se dividem em 3 grupos
  (ex. 3+3+4), nunca como uma 4ª combinação separada.

## Coringas (uso em combinação)

- Os 4 coringas tradicionais do baralho são sempre curinga; mais a carta específica determinada pela
  vira (ver acima) — portanto **2 cartas-curinga "da rodada" (mesmo valor, qualquer naipe correspondente
  à regra) + os 4 coringas impressos**.
- Um coringa substitui qualquer carta numa trinca ou sequência; pode haver vários na mesma combinação.
- Toda combinação precisa de **pelo menos 1 carta natural** — combinação só de coringas é inválida.

## Pontuação (sistema de vidas, Cacheta padrão)

- Cada jogador começa com **7 pontos**.
- Bater normal (9 cartas, com descarte): cada adversário perde **1 ponto**.
- **Bater com 10 cartas** ("bater limpo"): usa as 10 cartas (9 + a comprada) para formar as 3
  combinações, **sem descartar**; cada adversário perde **2 pontos**.
- Bater com jogo inválido (combinações erradas): quem bateu perde 2 pontos, a rodada **continua**
  (não termina).
- Quem chega a 0 pontos é eliminado; último jogador com pontos vence.

## Monte esgotado

- Recolhe-se o descarte inteiro **exceto a última carta** (que continua visível/disponível), embaralha,
  vira novo monte.

## Infrações

- Bater sem exatamente 3 combinações, ou com grupo de menos de 3 cartas.
- Sequência com naipes misturados.
- Não descartar ao fim do turno (exceto bater com 10).
- Descartar a carta que acabou de puxar do descarte.
- Combinação só de coringas.

## Variação "Cachetão" (2 a 9 jogadores)

- Começa com **10 pontos** (não 7).
- Permite "correr" (desistir da rodada), perdendo 1 ponto.
- Se a vira for **vermelha** (copas/ouros), as 4 cartas de mesmo valor e cor (não só a de valor
  superior) viram coringa — regra de coringa diferente da Cacheta padrão.
- Ao bater, adversários perdem 2 pontos cada (não 1) — igual ao "bater com 10" da Cacheta padrão, mas
  aplicado a toda batida normal deste modo.

## Perguntas frequentes relevantes

- Só o jogador seguinte pode pegar a carta recém-descartada (não qualquer um a qualquer momento).
- Não é obrigatório bater assim que as 3 combinações ficam prontas — pode-se guardar e bater depois.
- Descartar um coringa é tecnicamente permitido, só estrategicamente ruim.

---

## Divergências da implementação atual (`specs/001-cacheta-jogo-online/`)

Pontos onde o jogo já construído neste repositório **diverge deliberadamente ou por lacuna** das regras
acima — não assumir que um é "bug" do outro sem checar com o usuário primeiro, já que o motor de
pontuação do jogo (ranking contínuo) é uma escolha de produto diferente do sistema de vidas oficial:

1. **Baralho sem coringas impressos**: `lib/cacheta/cards.ts` → `buildDoubleDeck()` monta 2x52 = 104
   cartas, **sem os 4 coringas tradicionais**. A regra oficial usa 108 cartas (104 + 4 coringas). Os 4
   coringas impressos nunca existem neste jogo — só a carta-coringa determinada pela vira está ativa.
2. **"Quadra"/"quina" como formas alternativas de bater, não como regra oficial**: `lib/cacheta/rules.ts`
   trata uma mão de 9 cartas como podendo bater em **3+3+3** ("batida normal") **ou 4+5** ("quadra" +
   "quina", dois grupos em vez de três). A regra oficial não tem essa segunda forma — exige sempre
   **exatamente 3 combinações**; para 9 cartas, matematicamente só existe 3+3+3. "Quadra"/"quina" aqui
   são termos próprios deste produto (usados para dar pontuação diferenciada no ranking, não para
   replicar uma variante oficial chamada assim).
3. **Sem "bater com 10 cartas" (bater limpo)**: `baterCombinacao` (`lib/actions/cacheta.ts`) sempre exige
   exatamente 9 cartas selecionadas, mesmo quando a mão tem 10 — a 10ª carta fica implicitamente não
   usada, nunca a variante oficial de usar as 10 sem descartar.
4. **Sem sistema de vidas/pontos por rodada**: a pontuação aqui (`cacheta_game_results.points_awarded`,
   1/2/3 por `batida_normal`/`quadra`/`quina`) alimenta um ranking cumulativo entre partidas, não o
   sistema de 7 pontos/eliminação da regra oficial — cada partida tem só 1 vencedor (quem bate primeiro),
   sem os demais perderem pontos de vida nem haver eliminação dentro da própria partida.
5. **Monte esgotado**: `cacheta_reshuffle_if_empty` (migration `20261029000041`) já implementa
   corretamente "recolhe o descarte exceto o topo, embaralha" — consistente com a regra oficial.
6. **Validação de batida inválida**: como `validarBatida` roda no servidor antes de aceitar o "bater", uma
   batida com combinação errada nunca chega a ser registrada (é só um erro de formulário) — não existe o
   cenário oficial de "bateu errado, perde 2 pontos, jogo continua", porque o cliente nunca consegue
   bater de forma inválida para começo de conversa.
7. **Modo Cachetão (variante de 2-9 jogadores, coringa por cor, 10 pontos)** é um domínio **diferente**
   já existente no projeto (`cachetao_events`/`cachetao_registrations`, ver CLAUDE.md) — não tem relação
   com a variante "Cachetão" descrita nesta página de regras oficiais (mesmo nome, jogo diferente: aqui é
   um evento de sábado com inscrição, lá seria uma variante de regras de mesa). Não confundir os dois ao
   ler "Cachetão" em qualquer lugar deste repositório.
