"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type TabBarItem = { href: string; label: string };

// Shared by the admin account shell (app/admin/(shell)/[accountId]/layout.tsx)
// and the public player-facing pages (app/(public)/[accountHandle]/layout.tsx)
// — highlights the tab matching the current route with the .tab-link.is-active
// red underline (see globals.css).
export function TabBar({
  items,
  matchNested = false,
  className,
}: {
  items: TabBarItem[];
  // Admin sub-routes (e.g. /cachetao/[eventId], /ranking/[periodId]) should
  // keep their parent tab highlighted; the public pages have no nested
  // routes under a tab, so exact match is enough there.
  matchNested?: boolean;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex gap-2 border-b border-stroke", className)}>
      {items.map((item) => {
        const isActive = pathname === item.href || (matchNested && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn("btn btn-ghost btn-sm tab-link", isActive && "is-active")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
