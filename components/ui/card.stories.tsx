import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card, CardGrid } from "./card";

const meta = {
  title: "UI/Card",
  component: Card,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Card className="max-w-sm">
      <h2 className="font-display italic font-bold text-xl uppercase mb-2">Novo Cachetão</h2>
      <p className="text-ink-dim text-sm">Hover the left edge — it lights up red on interactive cards.</p>
    </Card>
  ),
};

// Big-number readout used for the public Cachetão page's countdown /
// remaining-slots display (see components/closing-countdown.tsx).
export const Stat: Story = {
  render: () => (
    <Card className="card-stat text-center max-w-xs">
      <div className="card-label">Fecha em</div>
      <div className="card-value">02:45</div>
    </Card>
  ),
};

// Player ranking preview — used decoratively on the homepage hero (app/page.tsx)
// to tease the ranking feature instead of generic hero art.
export const Driver: Story = {
  render: () => (
    <Card className="card-driver max-w-52">
      <div className="driver-top">
        <div className="driver-number">01</div>
        <div className="position-tag">P1</div>
      </div>
      <div>
        <div className="driver-name">@fulano</div>
        <div className="driver-team">Ranking da semana</div>
      </div>
      <div className="driver-bar-row">
        <span>Pontos</span>
        <div className="driver-bar">
          <span style={{ width: "92%" }} />
        </div>
        <span>92%</span>
      </div>
    </Card>
  ),
};

export const Grid: Story = {
  render: () => (
    <CardGrid>
      {["Pontuação", "Jogadores", "Lives"].map((label) => (
        <Card key={label}>
          <span className="font-display italic font-bold text-lg">{label}</span>
        </Card>
      ))}
    </CardGrid>
  ),
};
