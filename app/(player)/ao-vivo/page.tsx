import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AoVivoListPage() {
  const supabase = await createClient();
  const { data: broadcasts } = await supabase.rpc("list_live_broadcasts_now");

  const accountIds = [...new Set((broadcasts ?? []).map((b) => b.tiktok_account_id))];
  const { data: accounts } =
    accountIds.length > 0
      ? await supabase.from("tiktok_accounts").select("id, handle, display_name").in("id", accountIds)
      : { data: [] };

  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8 max-w-2xl mx-auto w-full">
      <div>
        <p className="caption">Cacheta Gordinho</p>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Ao vivo agora</h1>
      </div>

      <div className="flex flex-col gap-3">
        {(broadcasts ?? []).map((b) => {
          const account = accountById.get(b.tiktok_account_id);
          return (
            <Link key={b.id} href={`/ao-vivo/${b.id}`}>
              <Card className="flex flex-row items-center justify-between">
                <div>
                  <p className="font-display italic font-bold uppercase">
                    @{account?.handle ?? "?"}
                  </p>
                  {b.title && <p className="text-ink-dim text-sm">{b.title}</p>}
                </div>
                <Badge variant="green">Ao vivo</Badge>
              </Card>
            </Link>
          );
        })}
        {(broadcasts ?? []).length === 0 && (
          <p className="text-ink-dim">Ninguém está transmitindo agora.</p>
        )}
      </div>
    </main>
  );
}
