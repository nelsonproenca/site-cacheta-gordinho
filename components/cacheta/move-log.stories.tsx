import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MoveLog, type MoveLogEntry } from "./move-log";

const meta = {
  title: "Cacheta/MoveLog",
  component: MoveLog,
  parameters: { layout: "centered" },
} satisfies Meta<typeof MoveLog>;

export default meta;
type Story = StoryObj<typeof meta>;

const seatLabel = (seatId: string) => (seatId === "seat-1" ? "Você" : "Bot 2");

const moves: MoveLogEntry[] = [
  { id: "1", seat_id: "seat-1", type: "draw_monte", card: null, created_at: new Date().toISOString() },
  { id: "2", seat_id: "seat-1", type: "discard", card: { suit: "copas", rank: 7 }, created_at: new Date().toISOString() },
  { id: "3", seat_id: "seat-2", type: "draw_discard", card: { suit: "copas", rank: 7 }, created_at: new Date().toISOString() },
  { id: "4", seat_id: "seat-2", type: "discard", card: { suit: "ouros", rank: 10 }, created_at: new Date().toISOString() },
  { id: "5", seat_id: "seat-1", type: "expire", card: { suit: "paus", rank: 2 }, created_at: new Date().toISOString() },
  { id: "6", seat_id: "seat-2", type: "bater", card: null, created_at: new Date().toISOString() },
];

export const WithMoves: Story = {
  args: { moves, seatLabel },
};

export const Empty: Story = {
  args: { moves: [], seatLabel },
};
