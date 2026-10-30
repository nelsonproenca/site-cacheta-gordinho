"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { baterCombinacao } from "@/lib/actions/cacheta";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card as UiCard } from "@/components/ui/card";
import { HandFan } from "./hand-fan";
import { TurnTimer } from "./turn-timer";
import { MoveLog, type MoveLogEntry } from "./move-log";
import { RANK_LABEL, SUIT_LABEL, cardsEqual, type Card } from "@/lib/cacheta/cards";

type TableRow = {
  id: string;
  mode: string;
  status: string;
  monte_count: number;
  discard_pile: Card[];
  vira: Card | null;
  coringa: Card | null;
  turn_seat_id: string | null;
  turn_deadline_at: string | null;
  winner_seat_id: string | null;
};

type SeatRow = {
  id: string;
  seat_no: number;
  player_id: string | null;
  is_bot: boolean;
  hand_count: number;
  status: string;
};

// Sincronização via postgres_changes (mesmo padrão de
// components/broadcast/live-chat.tsx: fetch inicial + subscribe + dedupe por
// id + cleanup no unmount — ver research.md §1). Jogadas simples (comprar/
// descartar/expirar/avançar bot) chamam a RPC diretamente do cliente, como
// send_live_chat_message — "bater" passa pela Server Action baterCombinacao,
// que revalida a rota depois de gravar com o cliente service-role.
export function TableBoard({ tableId, myPlayerId }: { tableId: string; myPlayerId: string }) {
  const router = useRouter();
  const [table, setTable] = useState<TableRow | null>(null);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [myHand, setMyHand] = useState<Card[]>([]);
  const [moves, setMoves] = useState<MoveLogEntry[]>([]);
  const [selected, setSelected] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const botLoopInFlight = useRef(false);
  const expireInFlight = useRef(false);

  const mySeat = seats.find((s) => s.player_id === myPlayerId) ?? null;
  const isMyTurn = !!mySeat && table?.turn_seat_id === mySeat.id;

  useEffect(() => {
    const supabase = createClient();

    async function loadInitial() {
      const [{ data: t }, { data: s }, { data: m }, { data: h }] = await Promise.all([
        supabase.from("cacheta_tables").select("*").eq("id", tableId).single(),
        supabase.from("cacheta_table_seats").select("*").eq("table_id", tableId).order("seat_no"),
        supabase.from("cacheta_moves").select("*").eq("table_id", tableId).order("created_at").limit(50),
        supabase.from("cacheta_hands").select("cards").eq("table_id", tableId),
      ]);
      if (t) setTable(t as unknown as TableRow);
      if (s) setSeats(s as unknown as SeatRow[]);
      if (m) setMoves(m as unknown as MoveLogEntry[]);
      if (h && h[0]) setMyHand((h[0].cards as unknown as Card[]) ?? []);

      const playerIds = (s ?? []).map((seat) => seat.player_id).filter((id): id is string => !!id);
      if (playerIds.length > 0) {
        const { data: players } = await supabase.from("players").select("id, display_name").in("id", playerIds);
        const names: Record<string, string> = {};
        for (const p of players ?? []) names[p.id] = p.display_name;
        setPlayerNames(names);
      }
    }
    loadInitial();

    const channel = supabase
      .channel(`cacheta-table:${tableId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "cacheta_tables", filter: `id=eq.${tableId}` },
        (payload) => setTable(payload.new as unknown as TableRow),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cacheta_table_seats", filter: `table_id=eq.${tableId}` },
        (payload) => {
          const row = payload.new as unknown as SeatRow;
          setSeats((prev) => {
            const exists = prev.some((s) => s.id === row.id);
            return exists ? prev.map((s) => (s.id === row.id ? row : s)) : [...prev, row].sort((a, b) => a.seat_no - b.seat_no);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cacheta_moves", filter: `table_id=eq.${tableId}` },
        (payload) => {
          const row = payload.new as unknown as MoveLogEntry;
          setMoves((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cacheta_hands", filter: `table_id=eq.${tableId}` },
        (payload) => {
          const row = payload.new as { cards: Card[] } | undefined;
          // RLS só entrega este evento quando a mão é a do próprio chamador
          // (cacheta_hands_select_own) — nunca a de outro assento.
          if (row) setMyHand(row.cards ?? []);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableId]);

  // Avança bots em sequência enquanto a vez for de um assento is_bot — padrão
  // lazy sem cron (research.md §5): qualquer cliente presente na mesa pode
  // disparar, a RPC é segura sob chamadas concorrentes (lock de linha).
  useEffect(() => {
    if (table?.status !== "playing" || !table.turn_seat_id) return;
    const turnSeat = seats.find((s) => s.id === table.turn_seat_id);
    if (!turnSeat?.is_bot || botLoopInFlight.current) return;

    botLoopInFlight.current = true;
    const timeout = setTimeout(async () => {
      const supabase = createClient();
      await supabase.rpc("advance_bot_turn", { p_table_id: tableId });
      botLoopInFlight.current = false;
    }, 700);
    return () => {
      clearTimeout(timeout);
      botLoopInFlight.current = false;
    };
  }, [table?.status, table?.turn_seat_id, seats, tableId]);

  function seatLabel(seatId: string): string {
    const seat = seats.find((s) => s.id === seatId);
    if (!seat) return "?";
    if (seat.is_bot) return `Bot ${seat.seat_no}`;
    return seat.player_id ? (playerNames[seat.player_id] ?? "Jogador") : "Jogador";
  }

  function toggleCard(card: Card) {
    setSelected((prev) => (prev.some((c) => cardsEqual(c, card)) ? prev.filter((c) => !cardsEqual(c, card)) : [...prev, card]));
  }

  async function handleDraw(source: "monte" | "discard") {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc(source === "monte" ? "draw_from_monte" : "draw_from_discard", {
      p_table_id: tableId,
    });
    setBusy(false);
    if (rpcError) setError(rpcError.message);
  }

  async function handleDiscard() {
    if (selected.length !== 1) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("discard_card", { p_table_id: tableId, p_card: selected[0] as never });
    setBusy(false);
    setSelected([]);
    if (rpcError) setError(rpcError.message);
  }

  async function handleBater() {
    if (selected.length !== 9) return;
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("cards", JSON.stringify(selected));
    const result = await baterCombinacao(tableId, formData);
    setBusy(false);
    if (result && "error" in result) {
      setError(result.error);
    } else {
      setSelected([]);
      router.refresh();
    }
  }

  async function handleExpire() {
    if (expireInFlight.current) return;
    expireInFlight.current = true;
    const supabase = createClient();
    await supabase.rpc("expire_turn", { p_table_id: tableId });
    expireInFlight.current = false;
  }

  if (!table) return <p className="text-ink-dim p-6">Carregando mesa...</p>;

  if (table.status === "finished") {
    const winner = table.winner_seat_id ? seatLabel(table.winner_seat_id) : null;
    return (
      <UiCard className="flex flex-col gap-3 items-center text-center">
        <h2 className="font-display text-2xl italic font-extrabold uppercase">Partida encerrada</h2>
        {winner && <p className="text-lg">{winner} bateu!</p>}
        <MoveLog moves={moves} seatLabel={seatLabel} />
      </UiCard>
    );
  }

  const discardTop = table.discard_pile[table.discard_pile.length - 1] ?? null;
  const canDraw = mySeat && isMyTurn && myHand.length === 9 && table.status === "playing";
  const canDiscard = mySeat && isMyTurn && myHand.length === 10 && selected.length === 1;
  const canBater = mySeat && isMyTurn && selected.length === 9;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 flex-wrap">
          {seats.map((s) => (
            <Badge key={s.id} variant={s.id === table.turn_seat_id ? "yellow" : "neutral"}>
              {seatLabel(s.id)} ({s.hand_count}) {s.status === "batido" && "🏆"}
              {s.status === "eliminated" && "✕"}
            </Badge>
          ))}
        </div>
        <TurnTimer deadline={table.turn_deadline_at} isMyTurn={isMyTurn} onExpire={handleExpire} />
      </div>

      <UiCard className="flex flex-col items-center gap-4 py-8">
        <div className="flex gap-8 items-center">
          <div className="flex flex-col items-center gap-1">
            <button type="button" disabled={!canDraw || busy} onClick={() => handleDraw("monte")} className="btn btn-dark btn-sm">
              Comprar ({table.monte_count})
            </button>
            <span className="text-ink-dim text-xs">Monte</span>
          </div>
          {table.vira && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl font-bold">
                {RANK_LABEL[table.vira.rank]}
                {SUIT_LABEL[table.vira.suit]}
              </span>
              <span className="text-ink-dim text-xs">Vira</span>
            </div>
          )}
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              disabled={!canDraw || !discardTop || busy}
              onClick={() => handleDraw("discard")}
              className="btn btn-outline btn-sm"
            >
              {discardTop ? (
                <>
                  {RANK_LABEL[discardTop.rank]}
                  {SUIT_LABEL[discardTop.suit]}
                </>
              ) : (
                "—"
              )}
            </button>
            <span className="text-ink-dim text-xs">Descarte</span>
          </div>
        </div>
      </UiCard>

      <HandFan cards={myHand} selected={selected} onToggle={toggleCard} coringa={table.coringa} />

      <div className="flex gap-2 justify-center">
        <Button size="sm" variant="outline" disabled={!canDiscard || busy} onClick={handleDiscard}>
          Descartar
        </Button>
        <Button size="sm" variant="yellow" disabled={!canBater || busy} onClick={handleBater}>
          Bater
        </Button>
      </div>

      {error && <p className="error-text text-center">{error}</p>}

      <MoveLog moves={moves} seatLabel={seatLabel} />
    </div>
  );
}
