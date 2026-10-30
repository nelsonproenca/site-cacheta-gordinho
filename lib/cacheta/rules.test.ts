import { describe, expect, it } from "vitest";
import { validarBatida, combinationType } from "./rules";
import type { Card } from "./cards";

const NO_CORINGA: Card = { suit: "espadas", rank: 13 }; // não presente em nenhuma mão de teste abaixo

describe("validarBatida", () => {
  it("rejeita mão com tamanho diferente de 9", () => {
    const result = validarBatida([{ suit: "copas", rank: 1 }], NO_CORINGA);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/9 cartas/);
  });

  it("aceita batida normal: 3 trincas por valor", () => {
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
      expect(result.groups.every((g) => g.kind === "trinca")).toBe(true);
      expect(combinationType(result.groups)).toBe("batida_normal");
    }
  });

  it("aceita quadra (sequência de 4) + quina (sequência de 5)", () => {
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
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(combinationType(result.groups)).toBe("quina");
      expect(result.groups.map((g) => g.kind).sort()).toEqual(["quadra", "quina"]);
    }
  });

  it("aceita quadra (trinca com uma dobra) + quina (trinca com duas dobras)", () => {
    const hand: Card[] = [
      { suit: "copas", rank: 6 },
      { suit: "ouros", rank: 6 },
      { suit: "paus", rank: 6 },
      { suit: "espadas", rank: 6 }, // quadra: 4 cartas de valor 6
      { suit: "copas", rank: 10 },
      { suit: "ouros", rank: 10 },
      { suit: "paus", rank: 10 },
      { suit: "espadas", rank: 10 },
      { suit: "espadas", rank: 10 }, // quina: 5 cartas de valor 10 (2 baralhos permitem repetir naipe)
    ];
    const result = validarBatida(hand, NO_CORINGA);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(combinationType(result.groups)).toBe("quina");
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
