import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TabBar } from "@/components/ui/tab-bar";

const TAB_SEGMENTS = [
  { segment: "ranking", label: "Ranking" },
  { segment: "cachetao", label: "Cachetão" },
  { segment: "inscricao", label: "Cadastro" },
];

export default async function PublicAccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ accountHandle: string }>;
}) {
  const { accountHandle } = await params;
  const supabase = await createClient();
  const { data: account } = await supabase
    .from("tiktok_accounts")
    .select("handle")
    .eq("handle", accountHandle.toLowerCase())
    .maybeSingle();

  if (!account) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <TabBar
        items={TAB_SEGMENTS.map((t) => ({ href: `/${accountHandle}/${t.segment}`, label: t.label }))}
        className="justify-center p-4"
      />
      {children}
    </div>
  );
}
