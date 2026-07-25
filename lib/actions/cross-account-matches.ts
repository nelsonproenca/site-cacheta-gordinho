"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string } | { success: string } | null;

// Every mutating action below revalidates the live page (where confrontos
// are built) and, when the caller is on the "desafio" detail page (grouped
// view of every confronto against one specific opponent live —
// app/admin/(shell)/[accountId]/partidas/live/[sessionId]/desafios/[opponentLiveSessionId]),
// that page too. opponentLiveSessionId is optional in the FormData
// specifically so the original CrossStreamerSection call sites (which don't
// know or care about that route) keep working unchanged.
function revalidatePartidasPaths(accountId: string, liveSessionId: string, opponentLiveSessionId?: string) {
  revalidatePath(`/admin/${accountId}/partidas/live/${liveSessionId}`);
  if (opponentLiveSessionId) {
    revalidatePath(`/admin/${accountId}/partidas/live/${liveSessionId}/desafios/${opponentLiveSessionId}`);
  }
}

// Confrontos between a player on my live and a player on a different
// streamer's live — see cross_account_matches (20260724000025). No
// scoring_rule/points here on purpose: this phase only builds the pairing,
// scoring is a later "match execution" screen.
export async function createCrossAccountMatch(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const accountId = String(formData.get("account_id") ?? "");
  const liveSessionId = String(formData.get("live_session_id") ?? "");
  const playerId = String(formData.get("player_id") ?? "");
  const opponentAccountId = String(formData.get("opponent_account_id") ?? "");
  const opponentLiveSessionId = String(formData.get("opponent_live_session_id") ?? "");
  const opponentPlayerId = String(formData.get("opponent_player_id") ?? "");

  if (!liveSessionId || !playerId || !opponentLiveSessionId || !opponentPlayerId) {
    return { error: "Selecione um jogador de cada lado." };
  }
  if (playerId === opponentPlayerId) {
    return { error: "Selecione dois jogadores diferentes." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada, faça login novamente." };

  // Defense in depth against a manipulated form: re-check both players
  // actually belong to their claimed live's participant pool.
  const [{ data: myRow }, { data: theirRow }] = await Promise.all([
    supabase
      .from("live_participants")
      .select("player_id")
      .eq("live_session_id", liveSessionId)
      .eq("player_id", playerId)
      .maybeSingle(),
    supabase
      .from("live_participants")
      .select("player_id")
      .eq("live_session_id", opponentLiveSessionId)
      .eq("player_id", opponentPlayerId)
      .maybeSingle(),
  ]);
  if (!myRow || !theirRow) {
    return { error: "Os dois jogadores precisam ser participantes das respectivas lives." };
  }

  const { error } = await supabase.from("cross_account_matches").insert({
    account_id: accountId,
    live_session_id: liveSessionId,
    player_id: playerId,
    opponent_account_id: opponentAccountId,
    opponent_live_session_id: opponentLiveSessionId,
    opponent_player_id: opponentPlayerId,
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath(`/admin/${accountId}/partidas/live/${liveSessionId}`);
  return { success: "Confronto adicionado." };
}

export async function setCrossAccountMatchWinner(formData: FormData) {
  const accountId = String(formData.get("account_id") ?? "");
  const liveSessionId = String(formData.get("live_session_id") ?? "");
  const matchId = String(formData.get("match_id") ?? "");
  const winner = String(formData.get("winner") ?? "");
  const opponentLiveSessionId = String(formData.get("opponent_live_session_id") ?? "") || undefined;
  if (!matchId || (winner !== "player" && winner !== "opponent")) return;

  const supabase = await createClient();
  await supabase.from("cross_account_matches").update({ winner }).eq("id", matchId);

  revalidatePartidasPaths(accountId, liveSessionId, opponentLiveSessionId);
}

// The points "execution" screen — see 20260724000027. Requires a winner to
// already be set (points belong to a specific player, not an undetermined
// confronto). scoring_rules is global (20260725000028) — no longer scoped
// per account, so any active rule can apply to whichever side won.
export async function setCrossAccountMatchPoints(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const accountId = String(formData.get("account_id") ?? "");
  const liveSessionId = String(formData.get("live_session_id") ?? "");
  const opponentLiveSessionId = String(formData.get("opponent_live_session_id") ?? "") || undefined;
  const matchId = String(formData.get("match_id") ?? "");
  const scoringRuleId = String(formData.get("scoring_rule_id") ?? "");
  if (!matchId || !scoringRuleId) return { error: "Selecione a pontuação." };

  const supabase = await createClient();

  const { data: match } = await supabase
    .from("cross_account_matches")
    .select("winner")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return { error: "Confronto não encontrado." };
  if (!match.winner) return { error: "Defina o vencedor antes de lançar a pontuação." };

  const { data: rule } = await supabase
    .from("scoring_rules")
    .select("points")
    .eq("id", scoringRuleId)
    .maybeSingle();
  if (!rule) return { error: "Regra de pontuação não encontrada." };

  const { error } = await supabase
    .from("cross_account_matches")
    .update({ scoring_rule_id: scoringRuleId, points_awarded: rule.points })
    .eq("id", matchId);
  if (error) return { error: error.message };

  revalidatePartidasPaths(accountId, liveSessionId, opponentLiveSessionId);
  return { success: "Resultado salvo." };
}

// Swaps one side of an already-created confronto for a different player from
// the same live, instead of removing + recreating the whole row. "player"
// pulls from the logged-in streamer's own live (live_session_id); "opponent"
// pulls from whichever live that specific confronto was created against
// (opponent_live_session_id) — not necessarily whatever streamer/live is
// currently selected in the "montar confronto" form above, since that
// selection is just local UI state and this confronto may have been created
// earlier against a different one.
export async function swapCrossAccountMatchPlayer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const accountId = String(formData.get("account_id") ?? "");
  const liveSessionId = String(formData.get("live_session_id") ?? "");
  const matchId = String(formData.get("match_id") ?? "");
  const side = String(formData.get("side") ?? "");
  const newPlayerId = String(formData.get("new_player_id") ?? "");

  if (!matchId || !newPlayerId || (side !== "player" && side !== "opponent")) {
    return { error: "Selecione um jogador." };
  }

  const supabase = await createClient();

  const { data: match } = await supabase
    .from("cross_account_matches")
    .select("live_session_id, opponent_live_session_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return { error: "Confronto não encontrado." };

  const poolLiveId = side === "player" ? match.live_session_id : match.opponent_live_session_id;
  const { data: eligible } = await supabase
    .from("live_participants")
    .select("player_id")
    .eq("live_session_id", poolLiveId)
    .eq("player_id", newPlayerId)
    .maybeSingle();
  if (!eligible) return { error: "Esse jogador não é participante dessa live." };

  const { error } = await supabase
    .from("cross_account_matches")
    .update(side === "player" ? { player_id: newPlayerId } : { opponent_player_id: newPlayerId })
    .eq("id", matchId);
  if (error) {
    return {
      error: error.code === "23514" ? "Os dois jogadores precisam ser diferentes." : error.message,
    };
  }

  revalidatePath(`/admin/${accountId}/partidas/live/${liveSessionId}`);
  return { success: "Jogador trocado." };
}

export async function removeCrossAccountMatch(formData: FormData) {
  const accountId = String(formData.get("account_id") ?? "");
  const liveSessionId = String(formData.get("live_session_id") ?? "");
  const matchId = String(formData.get("match_id") ?? "");
  if (!matchId) return;

  const supabase = await createClient();
  await supabase.from("cross_account_matches").delete().eq("id", matchId);

  revalidatePath(`/admin/${accountId}/partidas/live/${liveSessionId}`);
}
