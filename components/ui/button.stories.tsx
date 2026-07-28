import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./button";

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: { layout: "centered" },
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "dark", "outline", "ghost", "yellow", "icon"],
    },
    size: { control: "select", options: ["default", "sm", "lg"] },
  },
  args: { children: "Criar Cachetão" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: "primary" } };
export const Dark: Story = { args: { variant: "dark" } };
export const Outline: Story = { args: { variant: "outline" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Yellow: Story = { args: { variant: "yellow" } };
export const Icon: Story = { args: { variant: "icon", children: "✕", "aria-label": "Fechar" } };
export const Disabled: Story = { args: { variant: "primary", disabled: true } };
export const Small: Story = { args: { variant: "outline", size: "sm" } };
export const Large: Story = { args: { variant: "primary", size: "lg" } };

export const AllVariants: Story = {
  args: {},
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="dark">Dark</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="yellow">Yellow</Button>
      <Button variant="icon" aria-label="Fechar">
        ✕
      </Button>
    </div>
  ),
};
