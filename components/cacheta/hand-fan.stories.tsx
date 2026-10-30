import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { HandFan } from "./hand-fan";
import type { Card as CacheteCard } from "@/lib/cacheta/cards";

const meta = {
  title: "Cacheta/HandFan",
  component: HandFan,
  parameters: { layout: "centered" },
  args: { onToggle: () => {} },
} satisfies Meta<typeof HandFan>;

export default meta;
type Story = StoryObj<typeof meta>;

// Inclui um par duplicado (dois 8 de espadas) de propósito — a Cacheta usa 2
// baralhos, e a seleção por índice (não por valor) tem que distinguir as duas
// cópias mesmo com naipe/rank idênticos.
const nineCardHand: CacheteCard[] = [
  { suit: "copas", rank: 1 },
  { suit: "ouros", rank: 1 },
  { suit: "paus", rank: 1 },
  { suit: "copas", rank: 5 },
  { suit: "ouros", rank: 5 },
  { suit: "paus", rank: 5 },
  { suit: "espadas", rank: 8 },
  { suit: "espadas", rank: 8 },
  { suit: "ouros", rank: 9 },
];

export const NineCards: Story = {
  args: { cards: nineCardHand, selectedIndices: [], coringa: null },
};

export const WithSelection: Story = {
  args: { cards: nineCardHand, selectedIndices: [0, 1], coringa: null },
};

export const DuplicateCardOnlyOneSelected: Story = {
  name: "Carta duplicada — só uma selecionada",
  args: { cards: nineCardHand, selectedIndices: [6], coringa: null },
};

export const WithCoringaHighlighted: Story = {
  args: { cards: nineCardHand, selectedIndices: [], coringa: nineCardHand[3] },
};

// Interativa — clicar numa carta alterna sua seleção e arrastar reordena a
// exibição, mesmo comportamento do uso real em table-board.tsx.
export const Interactive: Story = {
  args: { cards: nineCardHand, selectedIndices: [], coringa: null },
  render: () => {
    function Wrapper() {
      const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
      return (
        <HandFan
          cards={nineCardHand}
          selectedIndices={selectedIndices}
          coringa={null}
          onToggle={(index) =>
            setSelectedIndices((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]))
          }
        />
      );
    }
    return <Wrapper />;
  },
};
