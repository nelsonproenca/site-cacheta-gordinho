import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TabBar } from "./tab-bar";

const meta = {
  title: "UI/TabBar",
  component: TabBar,
  parameters: { layout: "padded" },
} satisfies Meta<typeof TabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

// Admin account shell (app/admin/(shell)/[accountId]/layout.tsx).
export const Admin: Story = {
  args: {
    items: [
      { href: "/admin/123/jogadores", label: "Jogadores" },
      { href: "/admin/123/lives", label: "Lives" },
      { href: "/admin/123/ranking", label: "Ranking" },
      { href: "/admin/123/cachetao", label: "Cachetão" },
    ],
    matchNested: true,
    className: "pb-3",
  },
};

// Public player-facing nav (app/(public)/[accountHandle]/layout.tsx).
export const Public: Story = {
  args: {
    items: [
      { href: "/streamer/ranking", label: "Ranking" },
      { href: "/streamer/cachetao", label: "Cachetão" },
      { href: "/streamer/inscricao", label: "Cadastro" },
    ],
    className: "justify-center p-4",
  },
};
