# Quickstart: validar o jogo de Cacheta jogável ponta a ponta

Pré-requisitos: `.env.local` configurado (mesmo projeto Supabase real já linkado — não há
Postgres local neste ambiente), migrations desta feature aplicadas (`supabase db push`),
`lib/supabase/database.types.ts` regenerado.

## M1 — Motor de regras + mesa contra robôs (uma única aba)

1. `npm run dev`.
2. Login de jogador (`/entrar`, telefone de teste configurado em
   `supabase/config.toml` → `[auth.sms.test_otp]`).
3. Abrir `/jogar/treino`, criar mesa `mode = 'bots'`.
4. Jogar uma rodada completa: comprar, descartar, repetir até ter uma combinação válida,
   acionar "Bater".
5. **Esperado**: tela de resultado mostrando o vencedor e a pontuação; nenhum erro de RLS
   no console; `cacheta_moves` da mesa reflete a sequência real de jogadas.
6. Rodar `lib/cacheta/rules.test.ts` (`npx vitest run lib/cacheta/rules.test.ts`) — cobre
   trinca/quadra/quina/coringa isoladamente, sem tocar o banco.
7. Script descartável (padrão do repo) verificando, contra o projeto real: criação de mesa,
   distribuição de 9 cartas, bloqueio de jogada fora de turno, `expire_turn` idempotente sob
   chamada dupla.

## M2 — Modo online (duas sessões reais)

1. Duas contas de jogador distintas (dois perfis de navegador, ou uma aba normal + uma
   anônima).
2. Jogador A cria mesa em `/jogar/online`; Jogador B entra pela mesma mesa.
3. Iniciar a partida; alternar jogadas entre as duas abas.
4. **Esperado**: cada jogada do Jogador A aparece na tela do Jogador B em poucos segundos
   (contagem de cartas, topo do descarte, de quem é a vez) sem recarregar a página.
5. Inspecionar a resposta de rede/Realtime na aba do Jogador B: a mão do Jogador A **nunca**
   deve aparecer, nem mesmo como payload bruto de um evento `postgres_changes`.
6. Deixar um turno expirar sem jogar; confirmar que o próprio cliente ocioso (ou o outro)
   dispara `expire_turn` e a partida segue.

## M3 — Pontuação/ranking do jogo (US3)

1. Completar ao menos duas partidas (treino ou online) com vencedores diferentes.
2. Abrir a tela de ranking deste jogo; confirmar que reflete `cacheta_game_results` e está
   visualmente separada do ranking de pontuação manual de lives existente.
3. Confirmar, lendo `lib/scoring/get-ranking.ts`, que nenhuma consulta ali foi alterada —
   o ranking de lives continua ignorando por completo as tabelas `cacheta_*`.

## Verificação de segurança (repetir a cada marco que mexer em RLS/função nova)

```sql
-- Confirma que nenhuma função nova ficou executável por anon (gotcha já documentado 2x no CLAUDE.md)
select grantee, routine_name
from information_schema.routine_privileges
where routine_name like 'cacheta_%' or routine_name in
  ('create_cacheta_table','join_cacheta_table','start_cacheta_game',
   'draw_from_monte','draw_from_discard','discard_card','expire_turn','advance_bot_turn')
  and grantee = 'anon';
-- Esperado: zero linhas.
```

Extensão de `tests/rls.test.ts` cobrindo as 4 tabelas novas fica para o fim da fase (M4),
por preferência já registrada do usuário — não repetir a cada migration intermediária.
