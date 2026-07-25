import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TabBar } from "@/components/ui/tab-bar";

const TAB_SEGMENTS = [
  { segment: "pontuacao", label: "Pontuação" },
  { segment: "jogadores", label: "Jogadores" },
  { segment: "lives", label: "Lives" },
  { segment: "ranking", label: "Ranking" },
  { segment: "caxetao", label: "Caxetão" },
];

export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const supabase = await createClient();
  const { data: account } = await supabase
    .from("tiktok_accounts")
    .select("id, handle, display_name")
    .eq("id", accountId)
    .maybeSingle();

  if (!account) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/contas" className="caption">
          ← Minhas contas
        </Link>
        <h1 className="font-display text-3xl italic font-extrabold uppercase mt-2">
          @{account.handle}
        </h1>
        <p className="text-ink-dim">{account.display_name}</p>
      </div>
      <TabBar
        items={TAB_SEGMENTS.map((t) => ({ href: `/admin/${accountId}/${t.segment}`, label: t.label }))}
        matchNested
        className="pb-3"
      />
      {children}
    </div>
  );
}
