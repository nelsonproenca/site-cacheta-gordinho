"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

// Collapsible sidenav section (app/admin/(shell)/layout.tsx). Starts open
// only when the current route falls under it (matchPrefixes — a string
// array, not a function, since a Server Component parent can't pass a
// function prop across the client boundary), otherwise collapsed. Children
// stay mounted either way (just display:none'd) so any nested client state
// isn't lost on toggle. The mobile breakpoint (globals.css,
// .nav-group-items.is-collapsed) forces items visible again there — the
// horizontal scroll layout has no label to click, so a collapsed group
// would otherwise be unreachable.
export function NavGroup({
  label,
  icon,
  matchPrefixes = [],
  children,
}: {
  label: string;
  icon: ReactNode;
  matchPrefixes?: string[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isActive = matchPrefixes.some((prefix) => pathname.startsWith(prefix));
  const [open, setOpen] = useState(isActive);

  return (
    <div className="nav-group">
      <button
        type="button"
        className="nav-label nav-label-toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="flex items-center">
            {icon}
          </span>
          {label}
        </span>
        <span aria-hidden="true" className={`nav-label-chevron ${open ? "is-open" : ""}`}>
          ›
        </span>
      </button>
      <div className={`nav-group-items ${open ? "" : "is-collapsed"}`}>{children}</div>
    </div>
  );
}
