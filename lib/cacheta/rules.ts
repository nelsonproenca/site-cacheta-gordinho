// Pure rule engine for "bater" (docs/prd-jogo-online.md §4, spec FR-006). No
// DB access here — lib/actions/cacheta.ts reads the hand via the RLS client
// and calls validarBatida with it; this module is deliberately independent
// and unit-tested on its own (rules.test.ts), per research.md §3.
//
// Interpretation of the rules as given ("batida normal = 3 trincas", "quadra
// = sequência de 4 OU trinca com uma dobra", "quina = sequência de 5 OU
// trinca com duas dobras") is that a winning hand of 9 cards partitions
// fully into groups of size 3 ("trinca"), 4 ("quadra") or 5 ("quina"), each
// either a run (same suit, consecutive ranks) or a set (same rank). The only
// ways to partition 9 cards into groups sized {3,4,5} are 3+3+3 ("batida
// normal") or 4+5 ("quadra" + "quina") — this is what drives the search
// below. This specific partition rule is an implementation decision, not a
// requirement quoted verbatim from the user — the "modo de 7 pontos" variant
// is explicitly out of scope here (spec FR-011, deferred).

import { type Card, cardsEqual, isCoringa } from "./cards";

export type GroupKind = "trinca" | "quadra" | "quina";

export type Grupo = {
  kind: GroupKind;
  cards: Card[];
};

export type BatidaValida = {
  valid: true;
  groups: Grupo[];
};

export type BatidaInvalida = {
  valid: false;
  reason: string;
};

const GROUP_KIND_BY_SIZE: Record<number, GroupKind> = { 3: "trinca", 4: "quadra", 5: "quina" };

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  const withFirst = combinations(rest, size - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, size);
  return [...withFirst, ...withoutFirst];
}

function complement(hand: Card[], chosen: Card[]): Card[] {
  const remaining = [...hand];
  for (const card of chosen) {
    const idx = remaining.findIndex((c) => cardsEqual(c, card));
    remaining.splice(idx, 1);
  }
  return remaining;
}

function isValidSet(cards: Card[], coringa: Card): boolean {
  const naturals = cards.filter((c) => !isCoringa(c, coringa));
  if (naturals.length === 0) return true; // all-coringa group — degenerate but internally consistent
  const rank = naturals[0].rank;
  return naturals.every((c) => c.rank === rank);
}

function isValidRun(cards: Card[], coringa: Card): boolean {
  const naturals = cards.filter((c) => !isCoringa(c, coringa));
  if (naturals.length === 0) return true;
  const suit = naturals[0].suit;
  if (!naturals.every((c) => c.suit === suit)) return false;

  const ranks = [...new Set(naturals.map((c) => c.rank))].sort((a, b) => a - b);
  if (ranks.length !== naturals.length) return false; // duplicate rank in a run is invalid

  const span = ranks[ranks.length - 1] - ranks[0] + 1;
  const gaps = span - ranks.length; // how many ranks are missing inside [min, max]
  const coringaCount = cards.length - naturals.length;
  // Coringas fill internal gaps first, then extend the run outward if any remain.
  return span <= cards.length && gaps <= coringaCount;
}

function isValidGroup(cards: Card[], coringa: Card): boolean {
  return isValidSet(cards, coringa) || isValidRun(cards, coringa);
}

function tryGroupShape(hand: Card[], sizes: number[], coringa: Card): Grupo[] | null {
  if (sizes.length === 1) {
    return isValidGroup(hand, coringa) ? [{ kind: GROUP_KIND_BY_SIZE[hand.length], cards: hand }] : null;
  }

  const [size, ...restSizes] = sizes;
  for (const chosen of combinations(hand, size)) {
    if (!isValidGroup(chosen, coringa)) continue;
    const rest = complement(hand, chosen);
    const restResult = tryGroupShape(rest, restSizes, coringa);
    if (restResult) {
      return [{ kind: GROUP_KIND_BY_SIZE[size], cards: chosen }, ...restResult];
    }
  }
  return null;
}

export function validarBatida(mao: Card[], coringa: Card): BatidaValida | BatidaInvalida {
  if (mao.length !== 9) {
    return { valid: false, reason: `A mão precisa ter 9 cartas para bater (tem ${mao.length}).` };
  }

  const normalShape = tryGroupShape(mao, [3, 3, 3], coringa);
  if (normalShape) return { valid: true, groups: normalShape };

  const quadraQuinaShape = tryGroupShape(mao, [4, 5], coringa);
  if (quadraQuinaShape) return { valid: true, groups: quadraQuinaShape };

  return {
    valid: false,
    reason: "Nenhuma combinação válida encontrada (nem 3 trincas, nem quadra + quina).",
  };
}

// Highest-value grouping found — used to label the win for scoring/ranking
// (cacheta_game_results.combination_type, see data-model.md). "Quina" beats
// "quadra" beats "batida_normal" by the point scale implied in the PRD
// (bigger/rarer groupings score more).
export function combinationType(groups: Grupo[]): "batida_normal" | "quadra" | "quina" {
  if (groups.some((g) => g.kind === "quina")) return "quina";
  if (groups.some((g) => g.kind === "quadra")) return "quadra";
  return "batida_normal";
}
