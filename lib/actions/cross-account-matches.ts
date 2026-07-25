"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string } | { success: string } | null;

// Partidas is a global area now (not nested under an account) — every
// mutation just revalidates the two routes that can show a confronto: the
// "jogar" index (list of partidas) and this specific partida's detail page.
function revalidatePartidasPaths(sessionId: string, opponentLiveSessionId: string) {
  revalidatePath("/admin/partidas/jogar");
  revalidatePath(`/admin/partidas/jogar/${sessionId}/${opponentLiveSessionId}`);
}

// Confrontos between a player on one streamer's live and a player on
// another's — see cross_account_matches (20260724000025). No scoring_rule/
// points here on purpose: this phase only builds the pairing, scoring is
// setCrossAccountMatchPoints below.
//
// Side A / Side B are symmetric — unlike the old account-nested version,
// there's no "my account" here (this screen isn't scoped to one anymore).
// cross_account_matches_insert_creator_side only allows the insert when the
// caller has_account_access(account_id), so we don't know upfront which of
// the two picked accounts that is: try Side A as account_id first, and if
// RLS rejects it, retry with the sides swapped. If neither works, the
// caller has access to neither side and shouldn't be creating this partida.
export async function createCrossAccountMatch(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sideAAccountId = String(formData.get("side_a_account_id") ?? "");
  const sideALiveSessionId = String(formData.get("side_a_live_session_id") ?? "");
  const sideAPlayerId = String(formData.get("side_a_player_id") ?? "");
  const sideBAccountId = String(formData.get("side_b_account_id") ?? "");
  const sideBLiveSessionId = String(formData.get("side_b_live_session_id") ?? "");
  const sideBPlayerId = String(formData.get("side_b_player_id") ?? "");

  if (!sideALiveSessionId || !sideAPlayerId || !sideBLiveSessionId || !sideBPlayerId) {
    return { error: "Selecione um jogador de cada lado." };
  }
  if (sideAPlayerId === sideBPlayerId) {
    return { error: "Selecione dois jogadores diferentes." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada, faça login novamente." };

  // Defense in depth against a manipulated form: re-check both players
  // actually belong to their claimed live's participant pool.
  const [{ data: aRow }, { data: bRow }] = await Promise.all([
    supabase
      .from("live_participants")
      .select("player_id")
      .eq("live_session_id", sideALiveSessionId)
      .eq("player_id", sideAPlayerId)
      .maybeSingle(),
    supabase
      .from("live_participants")
      .select("player_id")
      .eq("live_session_id", sideBLiveSessionId)
      .eq("player_id", sideBPlayerId)
      .maybeSingle(),
  ]);
  if (!aRow || !bRow) {
    return { error: "Os dois jogadores precisam ser participantes das respectivas lives." };
  }

  const asIs = await supabase.from("cross_account_matches").insert({
    account_id: sideAAccountId,
    live_session_id: sideALiveSessionId,
    player_id: sideAPlayerId,
    opponent_account_id: sideBAccountId,
    opponent_live_session_id: sideBLiveSessionId,
    opponent_player_id: sideBPlayerId,
    created_by: user.id,
  });

  if (asIs.error) {
    const swapped = await supabase.from("cross_account_matches").insert({
      account_id: sideBAccountId,
      live_session_id: sideBLiveSessionId,
      player_id: sideBPlayerId,
      opponent_account_id: sideAAccountId,
      opponent_live_session_id: sideALiveSessionId,
      opponent_player_id: sideAPlayerId,
      created_by: user.id,
    });
    if (swapped.error) {
      return { error: "Você precisa ter acesso a um dos dois streamers para criar essa partida." };
    }
  }

  revalidatePath("/admin/partidas/jogar");
  return { success: "Confronto adicionado." };
}

export async function setCrossAccountMatchWinner(formData: FormData) {
  const sessionId = String(formData.get("session_id") ?? "");
  const opponentLiveSessionId = String(formData.get("opponent_live_session_id") ?? "");
  const matchId = String(formData.get("match_id") ?? "");
  const winner = String(formData.get("winner") ?? "");
  if (!matchId || (winner !== "player" && winner !== "opponent")) return;

  const supabase = await createClient();
  await supabase.from("cross_account_matches").update({ winner }).eq("id", matchId);

  revalidatePartidasPaths(sessionId, opponentLiveSessionId);
}

// The points "execution" screen — see 20260724000027. Requires a winner to
// already be set (points belong to a specific player, not an undetermined
// confronto). scoring_rules is global (20260725000028) — no longer scoped
// per account, so any active rule can apply to whichever side won.
export async function setCrossAccountMatchPoints(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sessionId = String(formData.get("session_id") ?? "");
  const opponentLiveSessionId = String(formData.get("opponent_live_session_id") ?? "");
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

  revalidatePartidasPaths(sessionId, opponentLiveSessionId);
  return { success: "Resultado salvo." };
}

// Swaps one side of an already-created confronto for a different player from
// the same live, instead of removing + recreating the whole row. "player"
// pulls from that confronto's own live_session_id, "opponent" from its own
// opponent_live_session_id — always the row's actual sides, never whatever
// happens to be selected in the "criar partida" form.
export async function swapCrossAccountMatchPlayer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sessionId = String(formData.get("session_id") ?? "");
  const opponentLiveSessionId = String(formData.get("opponent_live_session_id") ?? "");
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

  revalidatePartidasPaths(sessionId, opponentLiveSessionId);
  return { success: "Jogador trocado." };
}

export async function removeCrossAccountMatch(formData: FormData) {
  const sessionId = String(formData.get("session_id") ?? "");
  const opponentLiveSessionId = String(formData.get("opponent_live_session_id") ?? "");
  const matchId = String(formData.get("match_id") ?? "");
  if (!matchId) return;

  const supabase = await createClient();
  await supabase.from("cross_account_matches").delete().eq("id", matchId);

  revalidatePartidasPaths(sessionId, opponentLiveSessionId);
}
