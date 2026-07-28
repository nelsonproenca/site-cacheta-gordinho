# Cacheta Gordinho

Plataforma de gestão de lives de Cacheta no TikTok: pontuação manual por partida, ranking semanal/temporada, Cachetão (evento de sábado com inscrição principal/suplente) e gestão multiconta.

- **`prd.md`** — requisitos de produto completos (regras de domínio, modelo de dados, roadmap). Leia antes de mexer em qualquer coisa relacionada a regras de negócio.
- **`CLAUDE.md`** — o que já foi implementado, decisões arquiteturais e "gotchas" conhecidos. Leia antes de mexer em código.
- **`assets/ferrari-design-system.html`** — design system de referência (cores, tipografia, componentes); portado em `app/globals.css`.

## Rodando localmente

```bash
npm install
npm run dev
```

Precisa de um `.env.local` com as variáveis do Supabase (ver `prd.md` §8.2). Não há Postgres local neste projeto — migrações em `supabase/migrations/` são escritas e aplicadas direto no projeto Supabase linkado (`supabase db push`).

## Comandos

Ver a seção "Commands" em `CLAUDE.md` para a lista completa (build, lint, migrações, smoke test, suíte de RLS, Storybook).

## Deploy

Vercel (auto-detecta o Next.js, sem `vercel.json` necessário). Ver a seção "Deploy (Vercel)" em `CLAUDE.md` — variáveis de ambiente exigidas, config externa no Supabase, e o lembrete de que migrações não fazem parte do build (`supabase db push` é um passo manual separado).
