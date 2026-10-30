// Domain types for the playable Cacheta game engine (Fase 6). Two standard
// 52-card decks (no printed jokers — the coringa is derived from the "vira"
// at the start of each hand, per docs/prd-jogo-online.md §4), so a full
// monte is 104 cards. Representation is intentionally plain jsonb-shaped
// data (suit + rank), not a class, since it round-trips directly through
// Postgres jsonb columns (cacheta_hands.cards, cacheta_tables.vira/coringa/
// discard_top) with no serialization layer.

export type Suit = "copas" | "ouros" | "paus" | "espadas";

// 1 = Ás, 11 = Valete, 12 = Dama, 13 = Rei.
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export type Card = {
  suit: Suit;
  rank: Rank;
};

export const SUITS: Suit[] = ["copas", "ouros", "paus", "espadas"];
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export function buildDoubleDeck(): Card[] {
  const deck: Card[] = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
  }
  return deck;
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

// Coringa: a carta de valor seguinte à vira, no mesmo naipe ("mantendo a
// mesma cor" — docs/prd-jogo-online.md §4). 13 (Rei) vira 1 (Ás).
export function coringaFromVira(vira: Card): Card {
  const nextRank = ((vira.rank % 13) + 1) as Rank;
  return { suit: vira.suit, rank: nextRank };
}

export function isCoringa(card: Card, coringa: Card): boolean {
  return cardsEqual(card, coringa);
}

export const RANK_LABEL: Record<Rank, string> = {
  1: "A",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
};

export const SUIT_LABEL: Record<Suit, string> = {
  copas: "♥",
  ouros: "♦",
  paus: "♣",
  espadas: "♠",
};
