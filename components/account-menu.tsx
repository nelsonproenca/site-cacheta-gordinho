"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOutToHome } from "@/lib/actions/auth";

// Replaces the "Área Restrita" link in the global masthead once a session
// exists. No Radix in this project (CLAUDE.md's mention of it was never
// actually installed) — a small custom dropdown, same "build it plain"
// spirit as components/ui/modal.tsx.
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost btn-sm inline-flex items-center gap-2"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">👤</span> Minha conta
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-[var(--radius)] border border-stroke bg-surface shadow-lg z-10 flex flex-col overflow-hidden">
          <Link href="/admin/contas" className="nav-item" onClick={() => setOpen(false)}>
            Painel admin
          </Link>
          <form action={signOutToHome}>
            <button type="submit" className="nav-item w-full text-left">
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
