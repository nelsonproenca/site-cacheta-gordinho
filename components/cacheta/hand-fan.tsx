"use client";

import { useRef, useState } from "react";
import { RANK_LABEL, SUIT_LABEL, cardsEqual, type Card as CacheteCard } from "@/lib/cacheta/cards";

// Seleção e exibição são por índice (posição da carta na mão), não por valor
// (naipe+rank) — a Cacheta usa 2 baralhos, então cartas repetidas (ex.: duas
// 8 de espadas) são comuns na mão, e comparar por valor fazia clicar numa
// delas selecionar as duas. `order` reordena só a exibição (drag-and-drop,
// nativo, sem dependência nova — mesma filosofia "build it plain" do
// resto do projeto); a seleção sempre se refere ao índice original em
// `cards`, então arrastar as cartas nunca muda qual carta está selecionada.
export function HandFan({
  cards,
  selectedIndices,
  onToggle,
  coringa,
}: {
  cards: CacheteCard[];
  selectedIndices: number[];
  onToggle: (index: number) => void;
  coringa: CacheteCard | null;
}) {
  const [order, setOrder] = useState<number[]>(() => cards.map((_, i) => i));
  const dragIndex = useRef<number | null>(null);
  const [dragOverPos, setDragOverPos] = useState<number | null>(null);

  // A mão só muda por uma ação real (comprar/descartar) — reseta a ordem de
  // exibição para a natural nesse momento (ajuste de estado durante a
  // renderização, não em efeito — react.dev/learn/you-might-not-need-an-effect);
  // o jogador reorganiza de novo (arrastando) à vontade antes de descartar ou bater.
  const [prevCards, setPrevCards] = useState(cards);
  if (cards !== prevCards) {
    setPrevCards(cards);
    setOrder(cards.map((_, i) => i));
  }

  function movePosition(from: number, to: number) {
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  return (
    <div className="flex flex-wrap gap-2 justify-center p-2">
      {order.map((origIndex, pos) => {
        const card = cards[origIndex];
        if (!card) return null;
        const isSelected = selectedIndices.includes(origIndex);
        const isRed = card.suit === "copas" || card.suit === "ouros";
        const isCoringa = coringa && cardsEqual(card, coringa);
        return (
          <button
            key={origIndex}
            type="button"
            draggable
            onDragStart={() => {
              dragIndex.current = pos;
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverPos(pos);
            }}
            onDragLeave={() => setDragOverPos((p) => (p === pos ? null : p))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex.current !== null && dragIndex.current !== pos) {
                movePosition(dragIndex.current, pos);
              }
              dragIndex.current = null;
              setDragOverPos(null);
            }}
            onDragEnd={() => {
              dragIndex.current = null;
              setDragOverPos(null);
            }}
            onClick={() => onToggle(origIndex)}
            className={`flex h-16 w-11 flex-col items-center justify-center rounded-[var(--radius-md)] border text-lg font-bold transition-transform cursor-grab active:cursor-grabbing ${
              isSelected ? "border-[var(--purple)] -translate-y-2 bg-surface" : "border-stroke bg-surface"
            } ${dragOverPos === pos ? "border-dashed border-[var(--yellow)]" : ""} ${isRed ? "text-red" : "text-ink"}`}
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
