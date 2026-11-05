# Quickstart: validação ponta a ponta

Sem Postgres local neste projeto — toda validação roda contra o projeto Supabase real já linkado
(Princípio V), com um script descartável (`scripts/_tmp-verify-*.ts`, apagado depois de rodar — mesmo
padrão já usado nas Fases 5/6), executado via:

```sh
node --env-file=.env.local --import tsx scripts/_tmp-verify-wallet.ts
```

## M1 — Carteira + compra de moedas (US1)

1. `supabase db push` com as migrations 1–6 (ver data-model.md).
2. `supabase gen types typescript --linked > lib/supabase/database.types.ts`.
3. Script cria um jogador identificado de teste (via `link_or_create_player` simulando telefone), chama
   `request_coin_purchase` para um pacote semeado, confirma `status = 'pending'` e saldo ainda zero.
4. Script, agindo como admin aprovado (service-role ou um admin de teste), chama `review_coin_purchase`
   aprovando — confirma saldo (soma de `wallet_movements`) igual ao `coin_amount` do pacote.
5. Repete para rejeição — confirma saldo não muda e `status = 'rejected'`.
6. Confirma que um jogador convidado (`signInAnonymously` + `link_or_create_guest_player`) recebe erro ao
   chamar `request_coin_purchase` e não consegue ler `platform_settings`/`coin_packages`.
7. Tenta aprovar o mesmo pedido duas vezes — segunda chamada deve falhar (`status != 'pending'`), sem
   duplicar o crédito.
8. `npm run lint` / `npm run build` limpos.

## M2 — Mesas pagas (US2, depende de M1)

1. `supabase db push` com a migration 7.
2. Dois jogadores identificados de teste com saldo pré-creditado (via o fluxo do M1 ou inserido
   diretamente pelo script com service-role, já que é um script de teste).
3. Jogador A cria mesa online com `p_entry_amount = 100` — confirma débito de 100 do saldo de A e mesa
   criada com `entry_amount = 100`.
4. Jogador B entra — confirma débito de 100 do saldo de B.
5. Roda a partida até o fim (reaproveitando o fluxo já existente de US1/US2 do jogo de Cacheta) e um dos
   dois bate.
6. Confirma: saldo do vencedor aumentou por `200 - taxa`; existe um `wallet_movements` com
   `reason = 'house_rake'` e `player_id null` no valor da taxa; saldo do perdedor não mudou.
7. Repete criando uma terceira mesa paga, cancela antes de outro jogador entrar (`cancel_cacheta_table`)
   — confirma estorno integral ao criador, sem `house_rake` gerado.
8. Confirma que um jogador convidado não consegue criar nem entrar numa mesa com `entry_amount > 0`
   (mesas com `entry_amount = 0` continuam funcionando para ele, sem regressão).

## M3 — Indicação (US3, depende de M2)

1. `supabase db push` com a migration 8.
2. Jogador A define um código de indicação; confirma que tentar redefinir falha.
3. Cria um jogador C novo passando o código de A (`link_or_create_player_by_email`/`link_or_create_player`
   com `p_referral_code`) — confirma `referral_links` vinculando C a A.
4. C joga e vence uma mesa paga (fluxo do M2) — confirma que A recebe `referral_commission` igual ao
   percentual configurado sobre a taxa daquela mesa.
5. Simula um `referral_links.created_at` de mais de 12 meses atrás (update direto via service-role, só
   para o teste) e repete uma mesa paga de C — confirma que nenhuma comissão é gerada dessa vez.
6. Confirma que A não consegue usar o próprio código (autoindicação bloqueada pelo `check` do banco).
7. Confirma que um jogador convidado não consegue chamar `set_referral_code`.

## M4 — Nick em tempo real + Google OAuth (US4, independente das outras)

1. `supabase db push` com as migrations 1–2 (se ainda não aplicadas) e qualquer ajuste de rota.
2. Script chama `is_handle_available` para um handle já usado (confirma `false`) e um livre (confirma
   `true`).
3. Verificação manual (não scriptável sem um fluxo OAuth real): login via Google na tela
   `/jogar/entrar`, primeira vez cai na escolha de nick, confirma criação de `players` com
   `is_guest = false`; segunda vez entra direto sem pedir nick de novo.
4. Confirma, lendo `auth.users` do usuário de teste criado via Google, que **nenhuma** linha foi criada
   em `admins` para ele (regressão do guard do research.md §3).

## Polish

- Estender `tests/rls.test.ts` cobrindo: jogador não lê carteira/pedidos de outro jogador; convidado não
  lê `platform_settings`/`coin_packages`; convidado não chama nenhuma RPC de dinheiro; admin não-aprovado
  não aprova pedido; storage de comprovante restrito ao dono + admin.
- `npm run lint` / `npm run build` limpos.
- Verificar privilégios (`information_schema.routine_privileges`/`column_privileges`) de toda função e
  coluna nova, por live query — não assumir do texto da migration (Princípio IV/V).
