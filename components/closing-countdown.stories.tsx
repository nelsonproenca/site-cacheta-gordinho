import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ClosingCountdown } from "./closing-countdown";
import { Card } from "@/components/ui/card";

const meta = {
  title: "Composite/ClosingCountdown",
  component: ClosingCountdown,
  parameters: { layout: "centered" },
} satisfies Meta<typeof ClosingCountdown>;

export default meta;
type Story = StoryObj<typeof meta>;

const in_ = (ms: number) => new Date(Date.now() + ms).toISOString();

// Admin listing/detail cards — compact inline text (size="sm", the default).
export const HoursRemainingCompact: Story = {
  args: { closesAt: in_(2 * 3600_000 + 45 * 60_000) },
};

export const LastMinuteCompact: Story = {
  args: { closesAt: in_(65_000) },
};

// Public Cachetão page's big "destaque maior" readout.
export const HoursRemainingLarge: Story = {
  args: { closesAt: in_(2 * 3600_000 + 45 * 60_000), size: "lg" },
  render: (args) => (
    <Card className="card-stat text-center max-w-xs">
      <div className="card-label">Fecha em</div>
      <ClosingCountdown {...args} />
    </Card>
  ),
};

export const ExpiredLarge: Story = {
  args: { closesAt: in_(-1000), size: "lg" },
  render: (args) => (
    <Card className="card-stat text-center max-w-xs">
      <div className="card-label">Fecha em</div>
      <ClosingCountdown {...args} />
    </Card>
  ),
};
