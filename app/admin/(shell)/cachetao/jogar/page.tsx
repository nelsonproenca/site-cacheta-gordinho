import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";

// Global list of Cachetão-sourced partidas — mirrors /admin/partidas/jogar,
// reading the same `partidas` table filtered to the cachetao_event_id side
// instead of live_session_id. RLS (partidas_select_either_side) already
// scopes rows to whatever the logged-in admin has access to, on either side.
export default async function JogarCachetaoPage() {
  const supabase = await createClient();

  const { data: partidas } = await supabase
    .from("partidas")
    .select(
      `id, name, created_at, cachetao_event_id, opponent_cachetao_event_id,
       account_a:tiktok_accounts!partidas_account_a_id_fkey(handle),
       account_b:tiktok_accounts!partidas_account_b_id_fkey(handle)`,
    )
    .not("cachetao_event_id", "is", null)
    .order("created_at", { ascending: false });

  const rows = (partidas ?? [])
    .filter((p) => p.account_a && p.account_b && p.cachetao_event_id && p.opponent_cachetao_event_id)
    .map((p) => ({ ...p, cachetao_event_id: p.cachetao_event_id!, opponent_cachetao_event_id: p.opponent_cachetao_event_id! }));

  const eventIds = [...new Set(rows.flatMap((p) => [p.cachetao_event_id, p.opponent_cachetao_event_id]))];
  const { data: eventRows } = eventIds.length
    ? await supabase.from("cachetao_events").select("id, status").in("id", eventIds)
    : { data: [] };
  const eventStatus = new Map((eventRows ?? []).map((e) => [e.id, e.status]));

  const { data: matchRows } = await supabase.from("cross_account_matches").select("partida_id").not("cachetao_event_id", "is", null);
  const counts = new Map<string, number>();
  for (const row of matchRows ?? []) {
    counts.set(row.partida_id, (counts.get(row.partida_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl italic font-extrabold uppercase">Jogar Cachetão</h1>
          <p className="text-ink-dim">Partidas montadas, da mais recente para a mais antiga.</p>
        </div>
        <Link href="/admin/cachetao/jogar/montar" className="btn btn-primary btn-sm">
          Montar confronto
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-ink-dim">Nenhuma partida montada ainda.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((p) => {
            const count = counts.get(p.id) ?? 0;
            const bothEventsActive =
              eventStatus.get(p.cachetao_event_id) !== "finished" &&
              eventStatus.get(p.opponent_cachetao_event_id) !== "finished";
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
                  <Link href={`/admin/cachetao/jogar/montar/${p.id}`} className="btn btn-outline btn-sm">
                    {bothEventsActive ? "Editar" : "Ver"}
                  </Link>
                  {bothEventsActive ? (
                    <Link
                      href={`/admin/cachetao/jogar/${p.cachetao_event_id}/${p.opponent_cachetao_event_id}`}
                      className="btn btn-primary btn-sm"
                    >
                      Jogar
                    </Link>
                  ) : (
                    <span className="text-ink-dim text-sm">Cachetão encerrado</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
