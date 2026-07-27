import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { closeLiveSession } from "@/lib/actions/lives";
import { closeStaleLiveSessions } from "@/lib/live-sessions";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddParticipantForm } from "./add-participant-form";
import { ResultsSection } from "./results-table";

export default async function LiveSessionPage({
  params,
}: {
  params: Promise<{ accountId: string; sessionId: string }>;
}) {
  const { accountId, sessionId } = await params;
  const supabase = await createClient();
  await closeStaleLiveSessions(supabase, accountId);

  const { data: session } = await supabase
    .from("live_sessions")
    .select("id, session_date, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) notFound();

  const [{ data: participantRows }, { data: scoringRules }, { data: results }] = await Promise.all([
    supabase
      .from("live_participants")
      .select("player_id, players(id, display_name, tiktok_handle)")
      .eq("live_session_id", sessionId),
    supabase
      .from("scoring_rules")
      .select("id, name, points")
      .eq("is_active", true)
      .order("points", { ascending: false }),
    supabase
      .from("match_results")
      .select(
        "id, player_id, scoring_rule_id, points_awarded, created_at, scoring_rules(name), matches!inner(live_session_id)",
      )
      .eq("matches.live_session_id", sessionId)
      .order("created_at", { ascending: false }),
  ]);

  const participants = (participantRows ?? [])
    .map((row) => row.players)
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="mono-data text-lg">{formatDateTime(session.session_date)}</span>
          <Badge variant={session.status === "open" ? "green" : "neutral"}>
            {session.status === "open" ? "Aberta" : "Encerrada"}
          </Badge>
        </div>
        {session.status === "open" && (
          <form action={closeLiveSession}>
            <input type="hidden" name="session_id" value={sessionId} />
            <input type="hidden" name="account_id" value={accountId} />
            <button type="submit" className="btn btn-outline btn-sm">
              Encerrar live
            </button>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="font-display italic font-bold text-xl uppercase mb-4">Participantes ({participants.length})</h2>
        <div className="flex flex-wrap gap-2 mb-5">
          {participants.map((p) => (
            <Badge key={p.id} variant="neutral">
              {p.display_name} (@{p.tiktok_handle})
            </Badge>
          ))}
          {participants.length === 0 && <p className="text-ink-dim text-sm">Ninguém entrou ainda.</p>}
        </div>
        <AddParticipantForm sessionId={sessionId} accountId={accountId} />
      </Card>

      <Card>
        <h2 className="font-display italic font-bold text-xl uppercase mb-4">Resultados</h2>
        {!scoringRules || scoringRules.length === 0 ? (
          <p className="text-ink-dim text-sm mb-4">
            Nenhuma regra de pontuação ativa.{" "}
            <Link href="/admin/pontuacao" className="text-red">
              Configure em Pontuação
            </Link>
            .
          </p>
        ) : (
          <ResultsSection
            sessionId={sessionId}
            accountId={accountId}
            participants={participants}
            results={results ?? []}
            scoringRules={scoringRules}
          />
        )}
      </Card>
    </div>
  );
}
