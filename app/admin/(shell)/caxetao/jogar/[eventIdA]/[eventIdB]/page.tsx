import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { DesafioSection } from "../../../../partidas/jogar/[sessionId]/[opponentLiveSessionId]/desafio-section";

// Resultado/Pontos launching screen for a Caxetão-sourced desafio — mirrors
// /admin/partidas/jogar/[sessionId]/[opponentLiveSessionId] exactly (same
// DesafioSection, reused as-is), keyed by the two caxetao_event ids instead
// of live_session ids.
export default async function DesafioCaxetaoPage({
  params,
}: {
  params: Promise<{ eventIdA: string; eventIdB: string }>;
}) {
  const { eventIdA, eventIdB } = await params;
  const supabase = await createClient();

  const [{ data: eventA }, { data: eventB }, { data: confrontoRows }] = await Promise.all([
    supabase.from("caxetao_events").select("id, tiktok_accounts(handle)").eq("id", eventIdA).maybeSingle(),
    supabase.from("caxetao_events").select("id, tiktok_accounts(handle)").eq("id", eventIdB).maybeSingle(),
    supabase
      .from("cross_account_matches")
      .select(
        `id, winner, scoring_rule_id, points_awarded,
         player:players!cross_account_matches_player_id_fkey(id, display_name, tiktok_handle),
         opponent_player:players!cross_account_matches_opponent_player_id_fkey(id, display_name, tiktok_handle),
         scoring_rules(name)`,
      )
      .eq("caxetao_event_id", eventIdA)
      .eq("opponent_caxetao_event_id", eventIdB)
      .order("created_at", { ascending: true }),
  ]);

  if (!eventA || !eventB || !eventA.tiktok_accounts || !eventB.tiktok_accounts) notFound();

  const confrontos = (confrontoRows ?? [])
    .filter((c) => c.player && c.opponent_player)
    .map((c) => ({
      id: c.id,
      winner: c.winner as "player" | "opponent" | null,
      scoringRuleId: c.scoring_rule_id,
      scoringRuleName: c.scoring_rules?.name ?? null,
      pointsAwarded: c.points_awarded,
      player: c.player!,
      opponentPlayer: c.opponent_player!,
    }));

  const winsA = confrontos.filter((c) => c.winner === "player").length;
  const winsB = confrontos.filter((c) => c.winner === "opponent").length;

  const { data: scoringRules } = await supabase
    .from("scoring_rules")
    .select("id, name, points")
    .eq("is_active", true)
    .order("points", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Partida em Andamento</h1>
      </div>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display italic font-bold text-xl uppercase mb-2">Placar</h2>
          <p className="mono-data text-lg font-bold">
            @{eventA.tiktok_accounts.handle} <span className="text-ink-dim">vs</span> @{eventB.tiktok_accounts.handle}
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <span className="text-ink-dim text-xs">@{eventA.tiktok_accounts.handle}</span>
            <span className="mono-data text-2xl">{winsA}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-ink-dim text-xs">@{eventB.tiktok_accounts.handle}</span>
            <span className="mono-data text-2xl">{winsB}</span>
          </div>
        </div>
      </Card>

      <DesafioSection confrontos={confrontos} scoringRules={scoringRules ?? []} />
    </div>
  );
}
