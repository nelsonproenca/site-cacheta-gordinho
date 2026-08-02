"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { deleteChatMessage, muteChatPlayer, unmuteChatPlayer } from "@/lib/actions/live-chat";
import { Button } from "@/components/ui/button";

type ChatMessage = {
  id: string;
  player_id: string;
  body: string;
  deleted_at: string | null;
  created_at: string;
};

type PlayerInfo = { display_name: string; tiktok_handle: string };

// Realtime is net-new infra in this codebase (nothing else uses
// supabase.channel(...) yet) — postgres_changes on live_chat_messages,
// filtered by live_broadcast_id, respects RLS natively (live_chat_messages_
// select policy, 20260801000039) so no separate "Realtime Authorization"
// setup is needed. Sending goes straight through the RPC from here instead
// of a Server Action — a chat send shouldn't pay for a full page action
// round trip, and the RPC enforces every rule (logged in, not muted,
// broadcast is live, length) server-side regardless of caller.
export function LiveChat({
  broadcastId,
  isModerator,
  returnPath,
}: {
  broadcastId: string;
  isModerator: boolean;
  returnPath: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [players, setPlayers] = useState<Record<string, PlayerInfo>>({});
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const playersRef = useRef(players);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    const supabase = createClient();

    async function ensurePlayerInfo(playerId: string) {
      if (playersRef.current[playerId]) return;
      const { data } = await supabase
        .from("players")
        .select("display_name, tiktok_handle")
        .eq("id", playerId)
        .maybeSingle();
      if (data) setPlayers((prev) => ({ ...prev, [playerId]: data }));
    }

    async function loadInitial() {
      const { data } = await supabase
        .from("live_chat_messages")
        .select("id, player_id, body, deleted_at, created_at, players(display_name, tiktok_handle)")
        .eq("live_broadcast_id", broadcastId)
        .order("created_at", { ascending: true })
        .limit(200);

      const rows = data ?? [];
      setMessages(
        rows.map((row) => ({
          id: row.id,
          player_id: row.player_id,
          body: row.body,
          deleted_at: row.deleted_at,
          created_at: row.created_at,
        })),
      );
      const infoMap: Record<string, PlayerInfo> = {};
      for (const row of rows) {
        if (row.players) infoMap[row.player_id] = row.players;
      }
      setPlayers((prev) => ({ ...prev, ...infoMap }));

      if (!isModerator) {
        const { data: myId } = await supabase.rpc("current_player_id");
        if (myId) {
          const { data: muteRow } = await supabase
            .from("live_chat_mutes")
            .select("id")
            .eq("live_broadcast_id", broadcastId)
            .eq("player_id", myId)
            .maybeSingle();
          setMuted(!!muteRow);
        }
      }
    }

    loadInitial();

    const channel = supabase
      .channel(`live-chat:${broadcastId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_chat_messages",
          filter: `live_broadcast_id=eq.${broadcastId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          ensurePlayerInfo(row.player_id);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "live_chat_messages",
          filter: `live_broadcast_id=eq.${broadcastId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [broadcastId, isModerator]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  async function handleSend(formData: FormData) {
    const body = String(formData.get("body") ?? "");
    if (!body.trim()) return;

    setSending(true);
    setError(null);
    const supabase = createClient();
    const { error: sendError } = await supabase.rpc("send_live_chat_message", {
      p_broadcast_id: broadcastId,
      p_body: body,
    });
    setSending(false);
    if (sendError) {
      setError(sendError.message);
      return;
    }
    const form = document.getElementById(`live-chat-form-${broadcastId}`) as HTMLFormElement | null;
    form?.reset();
  }

  const visible = messages.filter((m) => !m.deleted_at);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 max-h-96 overflow-y-auto rounded-[var(--radius-lg)] border border-stroke p-3">
        {visible.length === 0 && <p className="text-ink-dim text-sm">Nenhuma mensagem ainda.</p>}
        {visible.map((m) => {
          const info = players[m.player_id];
          return (
            <div key={m.id} className="flex items-start justify-between gap-2 text-sm">
              <p>
                <span className="font-display italic font-bold">
                  {info ? `@${info.tiktok_handle}` : "..."}
                </span>{" "}
                <span>{m.body}</span>
              </p>
              {isModerator && (
                <div className="flex gap-1 shrink-0">
                  <form action={deleteChatMessage}>
                    <input type="hidden" name="message_id" value={m.id} />
                    <input type="hidden" name="return_path" value={returnPath} />
                    <button type="submit" className="btn btn-ghost btn-sm" title="Apagar mensagem">
                      ✕
                    </button>
                  </form>
                  <form action={muteChatPlayer}>
                    <input type="hidden" name="broadcast_id" value={broadcastId} />
                    <input type="hidden" name="player_id" value={m.player_id} />
                    <input type="hidden" name="return_path" value={returnPath} />
                    <button type="submit" className="btn btn-ghost btn-sm" title="Silenciar jogador">
                      🔇
                    </button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {!isModerator &&
        (muted ? (
          <p className="text-ink-dim text-sm">Você foi silenciado neste chat.</p>
        ) : (
          <form id={`live-chat-form-${broadcastId}`} action={handleSend} className="flex gap-2">
            <input
              type="text"
              name="body"
              maxLength={300}
              required
              placeholder="Mandar mensagem..."
              className="input flex-1"
            />
            <Button type="submit" size="sm" disabled={sending}>
              Enviar
            </Button>
          </form>
        ))}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

// Admin-only helper, rendered by the moderator's own list of muted players
// for this broadcast — kept in this file since it's tightly coupled to the
// same broadcastId/returnPath contract as LiveChat above.
export function MutedPlayersList({
  broadcastId,
  returnPath,
  mutes,
}: {
  broadcastId: string;
  returnPath: string;
  mutes: { player_id: string; display_name: string; tiktok_handle: string }[];
}) {
  if (mutes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink-dim text-sm">Silenciados:</p>
      <div className="flex flex-wrap gap-2">
        {mutes.map((m) => (
          <form key={m.player_id} action={unmuteChatPlayer} className="inline-flex">
            <input type="hidden" name="broadcast_id" value={broadcastId} />
            <input type="hidden" name="player_id" value={m.player_id} />
            <input type="hidden" name="return_path" value={returnPath} />
            <button type="submit" className="badge badge-neutral inline-flex items-center gap-1">
              @{m.tiktok_handle} ✕
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
