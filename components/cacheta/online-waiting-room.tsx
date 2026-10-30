"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card as UiCard } from "@/components/ui/card";

type SeatRow = {
  id: string;
  seat_no: number;
  player_id: string | null;
  is_bot: boolean;
};

// Sala de espera do modo online (US2, T027) — mesmo padrão fetch inicial +
// postgres_changes + cleanup já usado em table-board.tsx. Quando o status da
// mesa deixa de ser 'waiting' (o criador chamou start_cacheta_game), chama
// router.refresh() para a página servidor (app/(player)/jogar/[tableId]/
// page.tsx) reler a mesa e passar a renderizar <TableBoard> no lugar desta
// sala — nenhuma lógica de jogo duplicada aqui.
export function OnlineWaitingRoom({
  tableId,
  myPlayerId,
  isCreator,
  maxSeats,
}: {
  tableId: string;
  myPlayerId: string;
  isCreator: boolean;
  maxSeats: number;
}) {
  const router = useRouter();
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function loadSeats() {
      const { data: s } = await supabase.from("cacheta_table_seats").select("id, seat_no, player_id, is_bot").eq("table_id", tableId).order("seat_no");
      if (s) setSeats(s as unknown as SeatRow[]);

      const playerIds = (s ?? []).map((seat) => seat.player_id).filter((id): id is string => !!id);
      if (playerIds.length > 0) {
        const { data: players } = await supabase.from("players").select("id, display_name").in("id", playerIds);
        const names: Record<string, string> = {};
        for (const p of players ?? []) names[p.id] = p.display_name;
        setPlayerNames(names);
      }
    }
    loadSeats();

    const channel = supabase
      .channel(`cacheta-waiting:${tableId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cacheta_table_seats", filter: `table_id=eq.${tableId}` },
        () => loadSeats(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "cacheta_tables", filter: `id=eq.${tableId}` },
        (payload) => {
          const row = payload.new as { status: string };
          if (row.status !== "waiting") router.refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableId, router]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("start_cacheta_game", { p_table_id: tableId });
    setStarting(false);
    if (rpcError) setError(rpcError.message);
    else router.refresh();
  }

  function seatLabel(seat: SeatRow): string {
    if (seat.player_id === myPlayerId) return "Você";
    return seat.player_id ? (playerNames[seat.player_id] ?? "Jogador") : "Vago";
  }

  return (
    <UiCard className="flex flex-col gap-4 items-center text-center py-8">
      <h2 className="font-display text-xl font-bold uppercase">Aguardando jogadores</h2>
      <p className="text-ink-dim text-sm">
        Compartilhe este código com outro jogador para que ele entre em <span className="mono-data">/jogar/online</span>:
      </p>
      <p className="mono-data text-lg">{tableId}</p>

      <div className="flex gap-2 flex-wrap justify-center">
        {Array.from({ length: maxSeats }).map((_, i) => {
          const seat = seats.find((s) => s.seat_no === i);
          return (
            <Badge key={i} variant={seat ? "green" : "neutral"}>
              {seat ? seatLabel(seat) : "Vago"}
            </Badge>
          );
        })}
      </div>

      {isCreator && (
        <Button variant="yellow" disabled={seats.length < 2 || starting} onClick={handleStart}>
          Iniciar partida ({seats.length}/{maxSeats})
        </Button>
      )}
      {!isCreator && <p className="text-ink-dim text-sm">Aguardando o criador da mesa iniciar a partida...</p>}

      {error && <p className="error-text">{error}</p>}
    </UiCard>
  );
}
