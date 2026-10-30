import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { HandFan } from "./hand-fan";
import type { Card as CacheteCard } from "@/lib/cacheta/cards";

const meta = {
  title: "Cacheta/HandFan",
  component: HandFan,
  parameters: { layout: "centered" },
} satisfies Meta<typeof HandFan>;

export default meta;
type Story = StoryObj<typeof meta>;

const nineCardHand: CacheteCard[] = [
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

export const NineCards: Story = {
  args: { cards: nineCardHand, selected: [], coringa: null },
};

export const WithSelection: Story = {
  args: { cards: nineCardHand, selected: [nineCardHand[0], nineCardHand[1]], coringa: null },
};

export const WithCoringaHighlighted: Story = {
  args: { cards: nineCardHand, selected: [], coringa: nineCardHand[3] },
};

// Interativa — clicar numa carta alterna sua seleção, mesmo comportamento do uso real em table-board.tsx.
export const Interactive: Story = {
  render: () => {
    function Wrapper() {
      const [selected, setSelected] = useState<CacheteCard[]>([]);
      return (
        <HandFan
          cards={nineCardHand}
          selected={selected}
          coringa={null}
          onToggle={(card) =>
            setSelected((prev) =>
              prev.some((c) => c.suit === card.suit && c.rank === card.rank)
                ? prev.filter((c) => !(c.suit === card.suit && c.rank === card.rank))
                : [...prev, card],
            )
          }
        />
      );
    }
    return <Wrapper />;
  },
};
