"use client";

import { useState } from "react";
import { markAllNotificationsRead } from "@/lib/actions/notifications";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { formatDateTime } from "@/lib/utils";

type Notification = { id: string; message: string; is_read: boolean; created_at: string };

// Global masthead (app/layout.tsx) — only rendered once a session exists.
// No realtime/polling on purpose (this app avoids Supabase Realtime/websockets
// everywhere, see CLAUDE.md) — the badge reflects whatever was unread at the
// last server render, refreshed on navigation like everything else here.
export function NotificationBell({ notifications }: { notifications: Notification[] }) {
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <>
      <button
        type="button"
        className="btn-icon relative"
        aria-label="Notificações"
        title="Notificações"
        onClick={() => {
          setOpen(true);
          if (unreadCount > 0) markAllNotificationsRead();
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-red text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalHeader title="Notificações" onClose={() => setOpen(false)} />
        <div className="flex flex-col gap-3">
          {notifications.length === 0 && <p className="text-ink-dim text-sm">Nenhuma notificação ainda.</p>}
          {notifications.map((n) => (
            <div key={n.id} className="border-b border-stroke-soft pb-3 last:border-none">
              <p className="text-sm">{n.message}</p>
              <p className="text-ink-dim text-xs mt-1">{formatDateTime(n.created_at)}</p>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
