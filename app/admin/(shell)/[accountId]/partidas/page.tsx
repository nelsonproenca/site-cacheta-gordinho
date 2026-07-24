import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { syncCaxetaoEventStatus, CAXETAO_STATUS_LABEL, CAXETAO_STATUS_VARIANT } from "@/lib/caxetao";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Entry point for pairing two players into a "partida" — picks the source
// (an open live OR a Caxetão with registrations closed, never both, per
// matches_exactly_one_source) before /partidas/live/[sessionId] or
// /partidas/caxetao/[eventId] loads that source's eligible player pool.
export default async function PartidasPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const supabase = await createClient();

  const [{ data: liveSessions }, { data: caxetaoEventRows }] = await Promise.all([
    supabase
      .from("live_sessions")
      .select("id, session_date")
      .eq("tiktok_account_id", accountId)
      .eq("status", "open")
      .order("session_date", { ascending: false }),
    supabase
      .from("caxetao_events")
      .select("*")
      .eq("tiktok_account_id", accountId)
      .order("event_date", { ascending: false }),
  ]);

  const syncedEvents = await Promise.all(
    (caxetaoEventRows ?? []).map((e) =>
      e.status === "scheduled" || e.status === "registrations_open" ? syncCaxetaoEventStatus(supabase, e) : e,
    ),
  );
  const closedEvents = syncedEvents.filter((e) => e.status !== "scheduled" && e.status !== "registrations_open");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Partidas</h1>
        <p className="text-ink-dim">Selecione uma live aberta ou um Caxetão com inscrições encerradas para parear jogadores.</p>
      </div>

      <div>
        <h2 className="font-display italic font-bold text-xl uppercase mb-4">Lives abertas</h2>
        <div className="flex flex-col gap-3">
          {(liveSessions ?? []).map((s) => (
            <Link key={s.id} href={`/admin/${accountId}/partidas/live/${s.id}`}>
              <Card className="flex flex-row items-center justify-between">
                <span className="mono-data">{formatDateTime(s.session_date)}</span>
                <Badge variant="green">Aberta</Badge>
              </Card>
            </Link>
          ))}
          {(liveSessions ?? []).length === 0 && (
            <p className="text-ink-dim text-sm">Nenhuma live aberta no momento.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="font-display italic font-bold text-xl uppercase mb-4">Caxetões com inscrições encerradas</h2>
        <div className="flex flex-col gap-3">
          {closedEvents.map((e) => (
            <Link key={e.id} href={`/admin/${accountId}/partidas/caxetao/${e.id}`}>
              <Card className="flex flex-row items-center justify-between">
                <span className="mono-data">{formatDate(e.event_date)}</span>
                <Badge variant={CAXETAO_STATUS_VARIANT[e.status] ?? "neutral"}>
                  {CAXETAO_STATUS_LABEL[e.status] ?? e.status}
                </Badge>
              </Card>
            </Link>
          ))}
          {closedEvents.length === 0 && (
            <p className="text-ink-dim text-sm">Nenhum Caxetão com inscrições encerradas no momento.</p>
          )}
        </div>
      </div>
    </div>
  );
}
