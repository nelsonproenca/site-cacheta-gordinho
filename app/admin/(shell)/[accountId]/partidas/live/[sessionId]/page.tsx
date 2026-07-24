import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PartidasSection } from "../../partidas-section";

export default async function PartidasLivePage({
  params,
}: {
  params: Promise<{ accountId: string; sessionId: string }>;
}) {
  const { accountId, sessionId } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("live_sessions")
    .select("id, session_date, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) notFound();

  const [{ data: participantRows }, { data: scoringRules }, { data: matchRows }] = await Promise.all([
    supabase
      .from("live_participants")
      .select("players(id, display_name, tiktok_handle)")
      .eq("live_session_id", sessionId),
    supabase
      .from("scoring_rules")
      .select("id, name, points")
      .eq("tiktok_account_id", accountId)
      .eq("is_active", true)
      .order("points", { ascending: false }),
    supabase
      .from("matches")
      .select(
        `id,
         player_a:players!matches_player_a_id_fkey(id, display_name, tiktok_handle),
         player_b:players!matches_player_b_id_fkey(id, display_name, tiktok_handle),
         match_results(id, player_id, scoring_rule_id, points_awarded, scoring_rules(name))`,
      )
      .eq("live_session_id", sessionId)
      .not("player_a_id", "is", null),
  ]);

  const pool = (participantRows ?? [])
    .map((row) => row.players)
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const matches = (matchRows ?? [])
    .filter((m) => m.player_a && m.player_b)
    .map((m) => ({
      id: m.id,
      playerA: m.player_a!,
      playerB: m.player_b!,
      resultA: m.match_results.find((r) => r.player_id === m.player_a!.id) ?? null,
      resultB: m.match_results.find((r) => r.player_id === m.player_b!.id) ?? null,
    }));

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-row items-center justify-between">
        <span className="mono-data text-lg">{formatDateTime(session.session_date)}</span>
        <Badge variant={session.status === "open" ? "green" : "neutral"}>
          {session.status === "open" ? "Aberta" : "Encerrada"}
        </Badge>
      </Card>

      <PartidasSection
        accountId={accountId}
        sourceType="live"
        sourceId={sessionId}
        sourceOpen={session.status === "open"}
        pool={pool}
        matches={matches}
        scoringRules={scoringRules ?? []}
      />
    </div>
  );
}
