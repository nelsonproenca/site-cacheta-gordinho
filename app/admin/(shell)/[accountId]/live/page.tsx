import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { startBroadcast } from "@/lib/actions/live-broadcasts";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_LABEL: Record<string, string> = {
  created: "Preparando",
  live: "Ao vivo",
  ended: "Encerrada",
};

const STATUS_VARIANT: Record<string, "green" | "yellow" | "neutral"> = {
  created: "yellow",
  live: "green",
  ended: "neutral",
};

export default async function AccountLivePage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const supabase = await createClient();
  const { data: broadcasts } = await supabase
    .from("live_broadcasts")
    .select("id, status, title, started_at, created_at")
    .eq("tiktok_account_id", accountId)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-row items-center justify-between">
        <div>
          <h2 className="font-display italic font-bold text-xl uppercase">Transmissão in-app</h2>
          <p className="text-ink-dim text-sm">Transmita direto do navegador, com chat ao vivo.</p>
        </div>
        <form action={startBroadcast}>
          <input type="hidden" name="account_id" value={accountId} />
          <Button type="submit">Ir ao vivo</Button>
        </form>
      </Card>

      <div className="flex flex-col gap-3">
        {(broadcasts ?? []).map((b) => (
          <Link key={b.id} href={`/admin/${accountId}/live/${b.id}`}>
            <Card className="flex flex-row items-center justify-between">
              <div>
                <span className="mono-data">{formatDateTime(b.started_at ?? b.created_at)}</span>
                {b.title && <p className="text-ink-dim text-sm">{b.title}</p>}
              </div>
              <Badge variant={STATUS_VARIANT[b.status] ?? "neutral"}>{STATUS_LABEL[b.status] ?? b.status}</Badge>
            </Card>
          </Link>
        ))}
        {(broadcasts ?? []).length === 0 && (
          <p className="text-ink-dim">Nenhuma transmissão ainda.</p>
        )}
      </div>
    </div>
  );
}
