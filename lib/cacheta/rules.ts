// Pure rule engine for "bater" (docs/prd-jogo-online.md §4, spec FR-006). No
// DB access here — lib/actions/cacheta.ts reads the hand via the RLS client
// and calls validarBatida with it; this module is deliberately independent
// and unit-tested on its own (rules.test.ts), per research.md §3.
//
// Aligned with the official rules (.claude/skills/regras-cacheta/SKILL.md):
// to bater, a hand must split into EXACTLY 3 groups, each with >=3 cards, no
// upper limit on group size — never a 2-group "quadra+quina" split (that was
// this engine's own earlier, non-official interpretation; removed). For a
// 9-card hand that's arithmetically only 3+3+3 ("batida normal", with a
// discard); for a 10-card hand (all 9 dealt cards + the one just drawn,
// "bater com 10"/"bater limpo", no discard) it's whatever 3-way split of 10
// into parts >=3 each validates (e.g. 3+3+4) — see combinationType below for
// how that distinction (not group size) drives scoring.

import { type Card, cardsEqual, isCoringa } from "./cards";

export type Grupo = {
  size: number;
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

// Finds any split of `hand` into exactly `groupsLeft` non-overlapping valid
// groups (each >=3 cards, no upper bound — official rule has none). Tries
// group sizes from 3 up to whatever still leaves room for the remaining
// groups (each needs >=3), so for 9 cards this only ever finds 3+3+3, and
// for 10 cards only 3-way splits like 3+3+4/3+4+3/4+3+3.
function findGroups(hand: Card[], groupsLeft: number, coringa: Card): Grupo[] | null {
  if (groupsLeft === 1) {
    return isValidGroup(hand, coringa) ? [{ size: hand.length, cards: hand }] : null;
  }

  const maxSize = hand.length - 3 * (groupsLeft - 1);
  for (let size = 3; size <= maxSize; size++) {
    for (const chosen of combinations(hand, size)) {
      if (!isValidGroup(chosen, coringa)) continue;
      const rest = complement(hand, chosen);
      const restResult = findGroups(rest, groupsLeft - 1, coringa);
      if (restResult) {
        return [{ size, cards: chosen }, ...restResult];
      }
    }
  }
  return null;
}

export function validarBatida(mao: Card[], coringa: Card): BatidaValida | BatidaInvalida {
  if (mao.length !== 9 && mao.length !== 10) {
    return { valid: false, reason: `A mão precisa ter 9 ou 10 cartas para bater (tem ${mao.length}).` };
  }

  const groups = findGroups(mao, 3, coringa);
  if (groups) return { valid: true, groups };

  return {
    valid: false,
    reason: "Nenhuma combinação válida encontrada (precisa de exatamente 3 grupos, cada um com 3 cartas ou mais).",
  };
}

// "Batida normal" (9 cartas, com descarte) vs. "bater com 10"/"bater limpo"
// (10 cartas, sem descartar) — a distinção oficial que vale pontos em dobro
// para quem bateu, não o tamanho dos grupos formados (ver SKILL.md).
export function combinationType(handSize: number): "batida_normal" | "bater_limpo" {
  return handSize === 10 ? "bater_limpo" : "batida_normal";
}
