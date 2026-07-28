import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type RankingEntry = {
  playerId: string;
  displayName: string;
  tiktokHandle: string;
  totalPoints: number;
  positiveResults: number;
};

type ResultRow = {
  points_awarded: number;
  player_id: string;
  players: { display_name: string; tiktok_handle: string } | null;
};

// Tie-break is points desc -> count of positive-point results desc -> handle
// alphabetical. prd.md §12 flags the exact "vitórias lambreta" tie-break as
// still open with the stakeholder (scoring_rules has no category column yet
// to distinguish a lambreta win from a normal one) — revisit once decided.
function aggregateRanking(rows: ResultRow[]): RankingEntry[] {
  const byPlayer = new Map<string, RankingEntry>();

  for (const row of rows) {
    const player = row.players;
    if (!player) continue;

    const existing = byPlayer.get(row.player_id) ?? {
      playerId: row.player_id,
      displayName: player.display_name,
      tiktokHandle: player.tiktok_handle,
      totalPoints: 0,
      positiveResults: 0,
    };

    existing.totalPoints += row.points_awarded;
    if (row.points_awarded > 0) existing.positiveResults += 1;

    byPlayer.set(row.player_id, existing);
  }

  return [...byPlayer.values()].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.positiveResults !== a.positiveResults) return b.positiveResults - a.positiveResults;
    return a.tiktokHandle.localeCompare(b.tiktokHandle);
  });
}

// Lifetime ranking across every result ever recorded for the account,
// regardless of score_period. Used where there's no period context (e.g. an
// account with no score_periods created yet).
//
// Excludes Cachetão-sourced matches on purpose (.not("matches.live_session_id",
// "is", null)) — Cachetão is a separate competition, isolated from the
// weekly/season ranking (see matches_set_score_period, which only ever fills
// score_period_id for live matches). getPeriodRanking below gets this for
// free through that same column; this fallback has to filter for it
// explicitly since it has no score_period to key off of.
export async function getRanking(
  supabase: SupabaseClient<Database>,
  tiktokAccountId: string,
): Promise<RankingEntry[]> {
  const { data, error } = await supabase
    .from("match_results")
    .select(
      "points_awarded, player_id, players(display_name, tiktok_handle), matches!inner(tiktok_account_id, live_session_id)",
    )
    .eq("matches.tiktok_account_id", tiktokAccountId)
    .not("matches.live_session_id", "is", null);

  if (error) throw error;

  return aggregateRanking(data ?? []);
}

// Ranking scoped to a single score_period — matches.score_period_id is
// denormalized from live_sessions via a DB trigger (see migration
// 20260717000013) specifically so this is a single-level join.
export async function getPeriodRanking(
  supabase: SupabaseClient<Database>,
  scorePeriodId: string,
): Promise<RankingEntry[]> {
  const { data, error } = await supabase
    .from("match_results")
    .select("points_awarded, player_id, players(display_name, tiktok_handle), matches!inner(score_period_id)")
    .eq("matches.score_period_id", scorePeriodId);

  if (error) throw error;

  return aggregateRanking(data ?? []);
}
