import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { DesafioSection } from "./desafio-section";

export default async function DesafioPage({
  params,
}: {
  params: Promise<{ accountId: string; sessionId: string; opponentLiveSessionId: string }>;
}) {
  const { accountId, sessionId, opponentLiveSessionId } = await params;
  const supabase = await createClient();

  const [{ data: myAccount }, { data: opponentSession }, { data: confrontoRows }] = await Promise.all([
    supabase.from("tiktok_accounts").select("handle").eq("id", accountId).maybeSingle(),
    supabase
      .from("live_sessions")
      .select("id, session_date, tiktok_account_id, tiktok_accounts(handle)")
      .eq("id", opponentLiveSessionId)
      .maybeSingle(),
    supabase
      .from("cross_account_matches")
      .select(
        `id, winner, scoring_rule_id, points_awarded, account_id, opponent_account_id,
         player:players!cross_account_matches_player_id_fkey(id, display_name, tiktok_handle),
         opponent_player:players!cross_account_matches_opponent_player_id_fkey(id, display_name, tiktok_handle),
         scoring_rules(name)`,
      )
      .eq("live_session_id", sessionId)
      .eq("opponent_live_session_id", opponentLiveSessionId)
      .order("created_at", { ascending: true }),
  ]);

  if (!myAccount || !opponentSession || !opponentSession.tiktok_accounts) notFound();

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

  const myWins = confrontos.filter((c) => c.winner === "player").length;
  const opponentWins = confrontos.filter((c) => c.winner === "opponent").length;

  const [{ data: myRules }, { data: opponentRules }] = await Promise.all([
    supabase
      .from("scoring_rules")
      .select("id, name, points")
      .eq("tiktok_account_id", accountId)
      .eq("is_active", true)
      .order("points", { ascending: false }),
    supabase
      .from("scoring_rules")
      .select("id, name, points")
      .eq("tiktok_account_id", opponentSession.tiktok_account_id)
      .eq("is_active", true)
      .order("points", { ascending: false }),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <Card className="flex flex-col gap-3 h-fit">
        <h2 className="font-display italic font-bold text-xl uppercase">Desafio dos Influencers</h2>
        <p className="text-ink-dim text-sm">{formatDateTime(opponentSession.session_date)}</p>
        <p className="mono-data text-sm">
          @{myAccount.handle} <span className="text-ink-dim">vs</span> @{opponentSession.tiktok_accounts.handle}
        </p>
        <div className="flex flex-col gap-1 mt-2">
          <div className="flex items-center justify-between">
            <span>@{myAccount.handle}</span>
            <span className="mono-data text-lg">{myWins}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>@{opponentSession.tiktok_accounts.handle}</span>
            <span className="mono-data text-lg">{opponentWins}</span>
          </div>
        </div>
      </Card>

      <DesafioSection
        accountId={accountId}
        sessionId={sessionId}
        opponentLiveSessionId={opponentLiveSessionId}
        confrontos={confrontos}
        myScoringRules={myRules ?? []}
        opponentScoringRules={opponentRules ?? []}
      />
    </div>
  );
}
