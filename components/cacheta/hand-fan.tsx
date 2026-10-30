"use client";

import { RANK_LABEL, SUIT_LABEL, cardsEqual, type Card as CacheteCard } from "@/lib/cacheta/cards";

export function HandFan({
  cards,
  selected,
  onToggle,
  coringa,
}: {
  cards: CacheteCard[];
  selected: CacheteCard[];
  onToggle: (card: CacheteCard) => void;
  coringa: CacheteCard | null;
}) {
  return (
    <div className="flex flex-wrap gap-2 justify-center p-2">
      {cards.map((card, i) => {
        const isSelected = selected.some((s) => cardsEqual(s, card));
        const isRed = card.suit === "copas" || card.suit === "ouros";
        const isCoringa = coringa && cardsEqual(card, coringa);
        return (
          <button
            key={`${card.suit}-${card.rank}-${i}`}
            type="button"
            onClick={() => onToggle(card)}
            className={`flex h-16 w-11 flex-col items-center justify-center rounded-[var(--radius-md)] border text-lg font-bold transition-transform ${
              isSelected ? "border-[var(--purple)] -translate-y-2 bg-surface" : "border-stroke bg-surface"
            } ${isRed ? "text-red" : "text-ink"}`}
          >
            <span>{RANK_LABEL[card.rank]}</span>
            <span>{SUIT_LABEL[card.suit]}</span>
            {isCoringa && <span className="text-[10px] text-[var(--purple)]">coringa</span>}
          </button>
        );
      })}
    </div>
  );
}
