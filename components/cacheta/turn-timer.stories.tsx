import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TurnTimer } from "./turn-timer";

const meta = {
  title: "Cacheta/TurnTimer",
  component: TurnTimer,
  parameters: { layout: "centered" },
  args: { onExpire: () => {} },
} satisfies Meta<typeof TurnTimer>;

export default meta;
type Story = StoryObj<typeof meta>;

const in_ = (ms: number) => new Date(Date.now() + ms).toISOString();

export const MyTurn: Story = {
  args: { deadline: in_(12_000), isMyTurn: true },
};

export const OpponentTurn: Story = {
  args: { deadline: in_(12_000), isMyTurn: false },
};

export const AboutToExpire: Story = {
  args: { deadline: in_(4_000), isMyTurn: true },
};

export const NoActiveTurn: Story = {
  args: { deadline: null, isMyTurn: false },
};
