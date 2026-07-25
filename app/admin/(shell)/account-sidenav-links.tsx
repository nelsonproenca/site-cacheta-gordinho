"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

// The outer shell layout (app/admin/(shell)/layout.tsx) wraps every /admin/**
// route, including the account-agnostic ones (/admin/contas, /admin/login,
// /admin/solicitacoes) — it has no [accountId] param of its own (a layout
// only receives dynamic params up to its own segment, not from segments
// below it). Partidas/Pontuação need an accountId to link to, so this reads
// it straight from the URL client-side instead, and only renders once we're
// actually inside an account (second path segment is a real account UUID,
// not one of the sibling top-level routes). Rendered as bare nav-items (no
// wrapping nav-group/nav-label of its own) so the caller can drop it inside
// the existing "Contas" group instead of a separate "Conta" heading.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function AccountSidenavLinks() {
  const pathname = usePathname();
  const [, admin, maybeAccountId] = pathname.split("/");

  if (admin !== "admin" || !maybeAccountId || !UUID_RE.test(maybeAccountId)) return null;

  return (
    <>
      <Link className="nav-item" href={`/admin/${maybeAccountId}/partidas`}>
        Partidas
      </Link>
      <Link className="nav-item" href={`/admin/${maybeAccountId}/pontuacao`}>
        Pontuação
      </Link>
    </>
  );
}
