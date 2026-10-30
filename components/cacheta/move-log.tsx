"use client";

import { RANK_LABEL, SUIT_LABEL, type Card as CacheteCard } from "@/lib/cacheta/cards";

export type MoveLogEntry = {
  id: string;
  seat_id: string;
  type: "draw_monte" | "draw_discard" | "discard" | "bater" | "expire";
  card: CacheteCard | null;
  created_at: string;
};

const TYPE_LABEL: Record<MoveLogEntry["type"], string> = {
  draw_monte: "comprou do monte",
  draw_discard: "comprou do descarte",
  discard: "descartou",
  bater: "bateu!",
  expire: "não jogou a tempo — descarte automático",
};

export function MoveLog({
  moves,
  seatLabel,
}: {
  moves: MoveLogEntry[];
  seatLabel: (seatId: string) => string;
}) {
  const recent = [...moves].slice(-20).reverse();

  return (
    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto text-sm">
      {recent.length === 0 && <p className="text-ink-dim">Nenhuma jogada ainda.</p>}
      {recent.map((m) => (
        <p key={m.id} className="text-ink-dim">
          <span className="font-display italic font-bold text-ink">{seatLabel(m.seat_id)}</span>{" "}
          {TYPE_LABEL[m.type]}
          {m.card && (
            <span className="mono-data ml-1">
              ({RANK_LABEL[m.card.rank]}
              {SUIT_LABEL[m.card.suit]})
            </span>
          )}
        </p>
      ))}
    </div>
  );
}
