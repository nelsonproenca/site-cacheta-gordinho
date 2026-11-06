import { describe, expect, it } from "vitest";
import { validarBatida, combinationType } from "./rules";
import type { Card } from "./cards";

const NO_CORINGA: Card = { suit: "espadas", rank: 13 }; // não presente em nenhuma mão de teste abaixo

describe("validarBatida", () => {
  it("rejeita mão com tamanho diferente de 9 ou 10", () => {
    const result = validarBatida([{ suit: "copas", rank: 1 }], NO_CORINGA);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/9 ou 10 cartas/);
  });

  it("aceita batida normal (9 cartas): só existe 3+3+3, nunca 4+5", () => {
    const hand: Card[] = [
      { suit: "copas", rank: 1 },
      { suit: "ouros", rank: 1 },
      { suit: "paus", rank: 1 },
      { suit: "copas", rank: 5 },
      { suit: "ouros", rank: 5 },
      { suit: "paus", rank: 5 },
      { suit: "copas", rank: 9 },
      { suit: "ouros", rank: 9 },
      { suit: "paus", rank: 9 },
    ];
    const result = validarBatida(hand, NO_CORINGA);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.groups).toHaveLength(3);
      expect(result.groups.every((g) => g.size === 3)).toBe(true);
      expect(combinationType(hand.length)).toBe("batida_normal");
    }
  });

  it("rejeita uma mão de 9 cartas que só forma 2 grupos (4+5) — não é regra oficial", () => {
    const hand: Card[] = [
      { suit: "copas", rank: 2 },
      { suit: "copas", rank: 3 },
      { suit: "copas", rank: 4 },
      { suit: "copas", rank: 5 },
      { suit: "ouros", rank: 7 },
      { suit: "ouros", rank: 8 },
      { suit: "ouros", rank: 9 },
      { suit: "ouros", rank: 10 },
      { suit: "ouros", rank: 11 },
    ];
    const result = validarBatida(hand, NO_CORINGA);
    expect(result.valid).toBe(false);
  });

  it("aceita bater com 10 cartas (bater limpo, sem descarte): 3 grupos somando 10, ex. 3+3+4", () => {
    const hand: Card[] = [
      { suit: "copas", rank: 6 },
      { suit: "ouros", rank: 6 },
      { suit: "paus", rank: 6 },
      { suit: "espadas", rank: 6 }, // grupo de 4 cartas de valor 6
      { suit: "copas", rank: 10 },
      { suit: "ouros", rank: 10 },
      { suit: "paus", rank: 10 },
      { suit: "copas", rank: 2 },
      { suit: "ouros", rank: 2 },
      { suit: "paus", rank: 2 },
    ];
    const result = validarBatida(hand, NO_CORINGA);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.groups).toHaveLength(3);
      expect(combinationType(hand.length)).toBe("bater_limpo");
    }
  });

  it("usa o coringa para completar uma trinca incompleta", () => {
    const coringa: Card = { suit: "copas", rank: 6 };
    const hand: Card[] = [
      { suit: "copas", rank: 1 },
      { suit: "ouros", rank: 1 },
      coringa, // substitui a terceira carta de valor 1
      { suit: "copas", rank: 9 },
      { suit: "ouros", rank: 9 },
      { suit: "paus", rank: 9 },
      { suit: "copas", rank: 11 },
      { suit: "ouros", rank: 11 },
      { suit: "paus", rank: 11 },
    ];
    const result = validarBatida(hand, coringa);
    expect(result.valid).toBe(true);
  });

  it("rejeita uma mão de 9 cartas sem nenhuma combinação válida", () => {
    const hand: Card[] = [
      { suit: "copas", rank: 1 },
      { suit: "ouros", rank: 3 },
      { suit: "paus", rank: 5 },
      { suit: "espadas", rank: 7 },
      { suit: "copas", rank: 9 },
      { suit: "ouros", rank: 11 },
      { suit: "paus", rank: 13 },
      { suit: "copas", rank: 2 },
      { suit: "ouros", rank: 4 },
    ];
    const result = validarBatida(hand, NO_CORINGA);
    expect(result.valid).toBe(false);
  });
});
