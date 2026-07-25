import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";

// Global list of "partidas" — every confronto grouped by which pair of
// lives it was built against. No manual account filter here: RLS
// (cross_account_matches_select_either_side) already scopes the rows to
// whatever the logged-in admin has access to, on either side.
export default async function JogarPartidaPage() {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("cross_account_matches")
    .select(
      `id, created_at, live_session_id, opponent_live_session_id,
       account:tiktok_accounts!cross_account_matches_account_id_fkey(handle),
       opponent_account:tiktok_accounts!cross_account_matches_opponent_account_id_fkey(handle),
       live_session:live_sessions!cross_account_matches_live_session_id_fkey(session_date)`,
    )
    .order("created_at", { ascending: false });

  const groups = new Map<
    string,
    { sessionId: string; opponentLiveSessionId: string; handleA: string; handleB: string; sessionDate: string; count: number; lastCreatedAt: string }
  >();
  for (const r of rows ?? []) {
    if (!r.account || !r.opponent_account || !r.live_session) continue;
    const key = `${r.live_session_id}|${r.opponent_live_session_id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        sessionId: r.live_session_id,
        opponentLiveSessionId: r.opponent_live_session_id,
        handleA: r.account.handle,
        handleB: r.opponent_account.handle,
        sessionDate: r.live_session.session_date,
        count: 1,
        lastCreatedAt: r.created_at,
      });
    }
  }
  const partidas = [...groups.values()].sort((a, b) => (a.lastCreatedAt < b.lastCreatedAt ? 1 : -1)).slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Jogar uma partida</h1>
        <p className="text-ink-dim">Últimas partidas montadas — abra uma para lançar o resultado.</p>
      </div>

      {partidas.length === 0 ? (
        <p className="text-ink-dim">Nenhuma partida montada ainda.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {partidas.map((p) => (
            <Link key={`${p.sessionId}|${p.opponentLiveSessionId}`} href={`/admin/partidas/jogar/${p.sessionId}/${p.opponentLiveSessionId}`}>
              <Card className="flex flex-row items-center justify-between">
                <span className="font-display italic font-bold">
                  @{p.handleA} <span className="text-ink-dim">vs</span> @{p.handleB}
                </span>
                <span className="text-ink-dim text-sm">{formatDateTime(p.sessionDate)}</span>
                <span className="mono-data text-sm">
                  {p.count} confronto{p.count === 1 ? "" : "s"}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
