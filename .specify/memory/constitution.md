<!--
Sync Impact Report
- Version change: [TEMPLATE] → 1.0.0 (initial ratification)
- Principles defined: I. RLS-First Authorization, II. No Direct Write on Sensitive Tables,
  III. Denormalization Requires a Validation Trigger, IV. Explicit Privilege Revocation,
  V. Verify Against the Real Linked Project, VI. Simplicity Over Speculative Abstraction
- Added sections: Technology Constraints, Development Workflow
- Removed sections: none (first ratification from template)
- Templates requiring follow-up: none — spec/plan/tasks templates are generic and already
  compatible with these principles.
- Deferred placeholders: RATIFICATION_DATE set to this amendment's date (no earlier
  documented ratification exists in the repo).
-->

# Site Cacheta Gordinho Constitution

## Core Principles

### I. RLS-First Authorization
Authorization is enforced primarily through Postgres Row Level Security policies, never
through application-level role checks alone. Every table that holds tenant-scoped or
player-private data MUST have RLS enabled, and access decisions MUST key off join tables
(`admin_account_access`) or identity-resolving helpers (`has_account_access`,
`is_account_owner`, `is_super_admin`, `current_player_id`), not off a single global role
flag checked in TypeScript. Application code MAY add defense-in-depth checks on top of RLS
(e.g. re-checking `is_approved_admin()` inside an RPC), but MUST NOT treat an app-level
check as a substitute for the underlying policy.
Rationale: this is a multi-tenant platform (several TikTok accounts, several admin roles,
player-private hand/session data); a bug in one Server Action must not be able to leak or
corrupt another tenant's or another player's data, so the database itself — not a
call-site check — is the last line of defense.

### II. No Direct Write on Sensitive Tables
A table whose writes require cross-row validation, identity resolution, or dedupe logic
(e.g. `players`, `cachetao_registrations`, `live_chat_messages`, `tiktok_accounts`) MUST
NOT grant a direct INSERT/UPDATE RLS policy to `anon`/`authenticated`. Writes instead go
through exactly one of two funnels: a `security definer` RPC that resolves the caller's
identity server-side (never trusting a client-supplied id) and performs the write
atomically, or a Server Action using the service-role client that first confirms access
through the normal per-request RLS-respecting client before performing the privileged
write. Business/dedupe logic for such a table MUST live in that one funnel, not be
duplicated between an RLS policy and application code.
Rationale: centralizing the write path is what already prevented duplicate-account and
duplicate-player bugs in this codebase (see `create_tiktok_account`, `registerPlayerForEvent`,
`send_live_chat_message`); splitting the logic across layers has repeatedly been the source
of drift bugs here.

### III. Denormalization Requires a Validation Trigger
A column denormalized onto a table purely to keep an RLS policy a cheap single-column
check (e.g. `matches.tiktok_account_id`, `partidas.account_a_id`) MUST be paired with a
`BEFORE INSERT OR UPDATE` trigger that re-derives the real value from the authoritative
foreign key and raises if they disagree. RLS alone only validates the column on the row
being written — it cannot detect that the column was set to a value inconsistent with a
related row.
Rationale: `has_account_access(tiktok_account_id)` only proves the caller owns *that*
account, not that the account truly matches e.g. `live_session_id`'s real account — this
exact gap was found and fixed once already (`matches_validate_account`) and must not be
reintroduced by a future denormalization.

### IV. Explicit Privilege Revocation
Every new sensitive function or column MUST explicitly `revoke all`/`revoke select` from
both `public` and `anon` before granting the intended narrower access, and this revoke
MUST be re-verified with a live query against `information_schema` (not assumed from the
migration text). A column-level revoke alone is a no-op in this project: default
privileges grant `anon`/`authenticated` table-wide SELECT and function-wide EXECUTE
automatically at `CREATE` time, independent of any `PUBLIC`-role revoke.
Rationale: this exact mistake shipped twice (`players.auth_phone`, then
`list_live_broadcasts_now`/`get_live_broadcast_public`) before the correct pattern —
revoke table/function-wide, then grant back an explicit narrower list — was identified;
repeating the no-op form silently reopens the same leak.

### V. Verify Against the Real Linked Project
There is no local Postgres/Docker environment for this project. Every RLS policy,
migration, and scoring/business-rule change MUST be verified against the real linked
Supabase project — via `npm run test:rls`, `scripts/smoke-test.ts`, or a throwaway
verification script that creates and tears down its own fixtures — not asserted from
reading the migration alone. New tables that gain RLS policies MUST eventually be covered
by `tests/rls.test.ts`, but per standing project preference, extending that suite is
deferred to the end of a phase rather than after every individual migration, to avoid
thrashing the suite mid-design.
Rationale: this project has repeatedly found that policy text that *looks* correct behaves
differently once executed (e.g. the SELECT-policy-hides-the-UPDATE-event gotcha with
`live_chat_messages`, the column-revoke no-op above) — only a live round-trip against the
real database catches these.

### VI. Simplicity Over Speculative Abstraction
Do not add configuration knobs, abstraction layers, or defensive error handling for cases
that cannot occur given this project's actual constraints (single deployment, no local
dev database, one `scoring_rules` set, no cron infrastructure). Prefer the lazy/on-read
pattern already established here (`closeStaleLiveSessions`, `syncCachetaoEventStatus`) over
introducing a scheduler for problems that can be resolved the next time a row is read.
Server Actions follow the existing lightweight convention: `"use server"`, manual
`FormData` validation (no schema-validation library), a shared `ActionState =
{ error: string } | { success: string } | null` return shape, and `revalidatePath` on
success — do not introduce a different validation or state pattern without a concrete
need the existing one cannot satisfy.
Rationale: every added abstraction in this codebase has historically been removed again
once it turned out to serve no real caller (see the notifications feature, removed after
shipping with no caller) — prefer shipping the direct version first.

## Technology Constraints

- Stack: Next.js 16 (App Router, TypeScript), Supabase (Postgres + Auth + RLS), Tailwind v4
  (`@theme inline` tokens ported from `assets/ferrari-design-system.html` into
  `app/globals.css`), deployed on Vercel. No `src/` directory; routes live under `app/`.
  Root proxy file is `proxy.ts`, not `middleware.ts` (Next.js 16 renamed the convention).
- This Next.js version has breaking changes past most models' training data
  (`AGENTS.md`). Before using any App Router API or file convention from memory, check
  `node_modules/next/dist/docs/` for the current behavior.
- Public ranking/bracket/player-facing read pages are public, no-login reads. All writes
  (lives, match results, Cachetão, championships, and any future game state) are
  admin/moderator- or authenticated-player-only, scoped by managed account or by the
  caller's own `players` row — never a global unscoped write.
- `prd.md` is the source of truth for the existing (live-scoring) domain's data model and
  business rules; `docs/prd-jogo-online.md` is the source of truth for the new playable-game
  feature line. A new feature's spec MUST NOT redefine entities or rules already settled in
  whichever of these two documents owns that domain — extend or reference them instead.

## Development Workflow

- Migrations live in `supabase/migrations/<YYYYMMDDHHmmss>_<description>.sql`, applied with
  `supabase db push` (a separate manual step — never assumed to happen as part of a Vercel
  build). `lib/supabase/database.types.ts` MUST be regenerated
  (`supabase gen types typescript --linked > lib/supabase/database.types.ts`) after any
  schema change in the same unit of work, since the typed Supabase clients will otherwise
  silently type-check against a stale schema.
- RLS policies are named `<table>_<verb>_<descriptor>` (e.g. `matches_select_either_side`,
  `players_select_public`); security-definer helpers are `stable`/`volatile` SQL or plpgsql
  functions with an explicit `set search_path = public`.
- A feature that introduces a materially new domain (not an extension of an existing one)
  gets its own migration file(s) and its own `lib/<domain>/` or `lib/actions/<domain>.ts`
  module — it MUST NOT be bolted onto an existing domain's table or action file just
  because the UI entry point happens to live nearby.
- Before any destructive git operation or any command that could discard uncommitted work,
  run `git status` first, per the project's standing operating agreement with its
  maintainer.

## Governance

This constitution governs engineering practice for this repository and supersedes ad hoc
convention when the two conflict. `CLAUDE.md` and `AGENTS.md` remain the detailed,
frequently-updated operational record (what was built, what gotchas were found, what is
still pending) — the constitution instead captures the durable *rules* those records
repeatedly demonstrate, and should change far less often.

Amendments: propose a change via `/speckit-constitution` (or direct edit) with the specific
principle text, the rationale, and — if it removes or redefines a principle — the migration
impact on in-flight specs/plans. Version bumps follow semantic versioning: MAJOR for a
backward-incompatible principle removal/redefinition, MINOR for a new principle or materially
expanded guidance, PATCH for wording/clarification only. Every `/speckit-plan` run MUST
verify its approach against this document's principles before proceeding; a plan that
needs to violate one MUST say so explicitly and justify why, not silently diverge.

**Version**: 1.0.0 | **Ratified**: 2026-10-29 | **Last Amended**: 2026-10-29
