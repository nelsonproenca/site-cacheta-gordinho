"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string } | { success: string } | null;

type SourceType = "live" | "cachetao";

function partidasPath(accountId: string, sourceType: SourceType, sourceId: string) {
  return `/admin/${accountId}/partidas/${sourceType === "live" ? "live" : "cachetao"}/${sourceId}`;
}

// Mirrors recordMatchResult/updateMatchResult/removeParticipant in
// lib/actions/lives.ts, but for a `matches` row that pairs two named players
// (player_a_id/player_b_id, see 20260724000023) instead of the legacy
// one-player-per-match rows that flow creates. Works identically for a live
// session or a Cachetão event — matches_validate_account/matches_set_score_period
// (existing triggers) already handle the source-specific account/score_period
// wiring regardless of which code path inserts the row.
export async function createPairedMatch(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const accountId = String(formData.get("account_id") ?? "");
  const sourceType = String(formData.get("source_type") ?? "") as SourceType;
  const sourceId = String(formData.get("source_id") ?? "");
  const playerAId = String(formData.get("player_a_id") ?? "");
  const playerBId = String(formData.get("player_b_id") ?? "");

  if (!accountId || !sourceId || !playerAId || !playerBId) {
    return { error: "Selecione os dois jogadores." };
  }
  if (playerAId === playerBId) {
    return { error: "Selecione dois jogadores diferentes." };
  }

  const supabase = await createClient();

  // Defense in depth against a manipulated form: re-check both players
  // actually belong to this source's eligible pool, the same query each
  // page already ran to build the <select> options.
  if (sourceType === "live") {
    const { data: rows } = await supabase
      .from("live_participants")
      .select("player_id")
      .eq("live_session_id", sourceId)
      .in("player_id", [playerAId, playerBId]);
    if ((rows?.length ?? 0) !== 2) {
      return { error: "Os dois jogadores precisam ser participantes desta live." };
    }
  } else {
    const { data: rows } = await supabase
      .from("cachetao_registrations")
      .select("player_id")
      .eq("cachetao_event_id", sourceId)
      .in("player_id", [playerAId, playerBId])
      .in("status", ["confirmed", "called_up"]);
    if ((rows?.length ?? 0) !== 2) {
      return { error: "Os dois jogadores precisam estar confirmados neste Cachetão." };
    }
  }

  const { error } = await supabase.from("matches").insert({
    tiktok_account_id: accountId,
    live_session_id: sourceType === "live" ? sourceId : null,
    cachetao_event_id: sourceType === "cachetao" ? sourceId : null,
    player_a_id: playerAId,
    player_b_id: playerBId,
  });

  if (error) return { error: error.message };

  revalidatePath(partidasPath(accountId, sourceType, sourceId));
  return { success: "Partida criada." };
}

export async function recordPairedResult(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const accountId = String(formData.get("account_id") ?? "");
  const sourceType = String(formData.get("source_type") ?? "") as SourceType;
  const sourceId = String(formData.get("source_id") ?? "");
  const matchId = String(formData.get("match_id") ?? "");
  const playerId = String(formData.get("player_id") ?? "");
  const scoringRuleId = String(formData.get("scoring_rule_id") ?? "");

  if (!matchId || !playerId || !scoringRuleId) return { error: "Selecione o resultado." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada, faça login novamente." };

  const { data: rule } = await supabase
    .from("scoring_rules")
    .select("points")
    .eq("id", scoringRuleId)
    .maybeSingle();
  if (!rule) return { error: "Regra de pontuação não encontrada." };

  const { error } = await supabase.from("match_results").insert({
    match_id: matchId,
    player_id: playerId,
    scoring_rule_id: scoringRuleId,
    points_awarded: rule.points,
    recorded_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath(partidasPath(accountId, sourceType, sourceId));
  return { success: "Resultado lançado." };
}

// Identical to updateMatchResult (lib/actions/lives.ts) — same audit trail
// via match_result_edits before the actual update.
export async function updatePairedResult(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const accountId = String(formData.get("account_id") ?? "");
  const sourceType = String(formData.get("source_type") ?? "") as SourceType;
  const sourceId = String(formData.get("source_id") ?? "");
  const matchResultId = String(formData.get("match_result_id") ?? "");
  const scoringRuleId = String(formData.get("scoring_rule_id") ?? "");

  if (!matchResultId || !scoringRuleId) return { error: "Selecione o novo resultado." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada, faça login novamente." };

  const { data: current } = await supabase
    .from("match_results")
    .select("scoring_rule_id, points_awarded, matches!inner(tiktok_account_id)")
    .eq("id", matchResultId)
    .single();
  if (!current) return { error: "Resultado não encontrado." };

  const { data: newRule } = await supabase
    .from("scoring_rules")
    .select("points")
    .eq("id", scoringRuleId)
    .maybeSingle();
  if (!newRule) return { error: "Regra de pontuação não encontrada." };

  const { error: logError } = await supabase.from("match_result_edits").insert({
    match_result_id: matchResultId,
    action: "update",
    previous_scoring_rule_id: current.scoring_rule_id,
    previous_points_awarded: current.points_awarded,
    new_scoring_rule_id: scoringRuleId,
    new_points_awarded: newRule.points,
    edited_by: user.id,
    tiktok_account_id: current.matches.tiktok_account_id,
  });
  if (logError) return { error: logError.message };

  const { error } = await supabase
    .from("match_results")
    .update({ scoring_rule_id: scoringRuleId, points_awarded: newRule.points })
    .eq("id", matchResultId);
  if (error) return { error: error.message };

  revalidatePath(partidasPath(accountId, sourceType, sourceId));
  return { success: "Resultado atualizado." };
}

// Removes a partida entirely: both match_results (if launched, each logged
// to match_result_edits like updatePairedResult's delete counterpart), then
// the matches row itself. The two players simply go back to being regular
// entries in the pool, free to be paired into a new partida.
export async function removePairedMatch(formData: FormData) {
  const accountId = String(formData.get("account_id") ?? "");
  const sourceType = String(formData.get("source_type") ?? "") as SourceType;
  const sourceId = String(formData.get("source_id") ?? "");
  const matchId = String(formData.get("match_id") ?? "");
  if (!matchId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: results } = await supabase
    .from("match_results")
    .select("id, scoring_rule_id, points_awarded")
    .eq("match_id", matchId);

  for (const result of results ?? []) {
    await supabase.from("match_result_edits").insert({
      match_result_id: result.id,
      action: "delete",
      previous_scoring_rule_id: result.scoring_rule_id,
      previous_points_awarded: result.points_awarded,
      edited_by: user.id,
      tiktok_account_id: accountId,
    });
  }

  await supabase.from("match_results").delete().eq("match_id", matchId);
  await supabase.from("matches").delete().eq("id", matchId);

  revalidatePath(partidasPath(accountId, sourceType, sourceId));
}
