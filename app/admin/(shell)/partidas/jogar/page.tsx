import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";

// Global list of partidas (20260727000030) — a real record now, not a
// grouping of cross_account_matches computed in JS. No manual account
// filter here: RLS (partidas_select_either_side) already scopes the rows
// to whatever the logged-in admin has access to, on either side. Sorted
// newest-first, same "preload everything, small dataset" approach as the
// rest of this app — the confronto count per partida is grouped from a
// second small query rather than a PostgREST aggregate embed.
export default async function JogarPartidaPage() {
  const supabase = await createClient();

  const { data: partidas } = await supabase
    .from("partidas")
    .select(
      `id, name, created_at, live_session_id, opponent_live_session_id,
       account_a:tiktok_accounts!partidas_account_a_id_fkey(handle),
       account_b:tiktok_accounts!partidas_account_b_id_fkey(handle)`,
    )
    .order("created_at", { ascending: false });

  const { data: matchRows } = await supabase.from("cross_account_matches").select("partida_id");
  const counts = new Map<string, number>();
  for (const row of matchRows ?? []) {
    counts.set(row.partida_id, (counts.get(row.partida_id) ?? 0) + 1);
  }

  const rows = (partidas ?? []).filter((p) => p.account_a && p.account_b);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Jogar uma partida</h1>
        <p className="text-ink-dim">Partidas montadas, da mais recente para a mais antiga.</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-ink-dim">Nenhuma partida montada ainda.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((p) => {
            const count = counts.get(p.id) ?? 0;
            return (
              <Card key={p.id} className="flex flex-row items-center justify-between gap-4">
                <div>
                  <p className="font-display italic font-bold">
                    @{p.account_a!.handle} <span className="text-ink-dim">vs</span> @{p.account_b!.handle}
                  </p>
                  <p className="text-ink-dim text-sm">{formatDateTime(p.created_at)}</p>
                  <p className="mono-data text-sm text-ink-dim">
                    {count} confronto{count === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/admin/partidas/criar/${p.id}`} className="btn btn-outline btn-sm">
                    Editar
                  </Link>
                  <Link href={`/admin/partidas/jogar/${p.live_session_id}/${p.opponent_live_session_id}`} className="btn btn-sm">
                    Jogar
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
