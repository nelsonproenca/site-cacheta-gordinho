"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildPartidaName } from "@/lib/utils";

export type ActionState = { error: string } | { success: string } | null;

type ConfrontoSource = {
  live_session_id: string | null;
  opponent_live_session_id: string | null;
  cachetao_event_id: string | null;
  opponent_cachetao_event_id: string | null;
};

// Partidas is a global area now (not nested under an account) — every
// mutation revalidates every route that can show a confronto: "criar" (the
// just-built list under the form), the "jogar" index, and this specific
// partida's detail page. Reads the row's own source columns rather than
// trusting caller-supplied ids, so this works for both the live-sourced
// Partidas flow and the Cachetão-sourced one below without the caller having
// to know which it is.
function revalidateConfrontoPaths(row: ConfrontoSource) {
  if (row.live_session_id && row.opponent_live_session_id) {
    revalidatePath("/admin/partidas/criar");
    revalidatePath("/admin/partidas/jogar");
    revalidatePath(`/admin/partidas/jogar/${row.live_session_id}/${row.opponent_live_session_id}`);
  } else if (row.cachetao_event_id && row.opponent_cachetao_event_id) {
    revalidatePath("/admin/cachetao/criar");
    revalidatePath("/admin/cachetao/jogar");
    revalidatePath(`/admin/cachetao/jogar/${row.cachetao_event_id}/${row.opponent_cachetao_event_id}`);
  }
}

type LivePartidaRow = {
  id: string;
  account_a_id: string;
  account_b_id: string;
  live_session_id: string;
  opponent_live_session_id: string;
};

// Finds the partida that already covers this exact pair of lives (in
// either storage orientation — a partida's account_a/account_b assignment
// depends on which side the RLS insert-creator-side check let through, see
// below), or creates one. A partida's two sides are immutable once created
// (no update policy on partidas at all — 20260727000030), so every
// confronto ever added between these same two lives lands on the same row,
// under the same name.
async function resolvePartida(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sides: { sideAAccountId: string; sideALiveSessionId: string; sideBAccountId: string; sideBLiveSessionId: string },
): Promise<LivePartidaRow | null> {
  const { sideAAccountId, sideALiveSessionId, sideBAccountId, sideBLiveSessionId } = sides;

  const { data: existing } = await supabase
    .from("partidas")
    .select("id, account_a_id, account_b_id, live_session_id, opponent_live_session_id")
    .or(
      `and(live_session_id.eq.${sideALiveSessionId},opponent_live_session_id.eq.${sideBLiveSessionId}),` +
        `and(live_session_id.eq.${sideBLiveSessionId},opponent_live_session_id.eq.${sideALiveSessionId})`,
    )
    .not("live_session_id", "is", null)
    .maybeSingle();
  if (existing) return existing as LivePartidaRow;

  const [{ data: accountA }, { data: accountB }] = await Promise.all([
    supabase.from("tiktok_accounts").select("handle").eq("id", sideAAccountId).maybeSingle(),
    supabase.from("tiktok_accounts").select("handle").eq("id", sideBAccountId).maybeSingle(),
  ]);
  const name = buildPartidaName(accountA?.handle ?? "conta", accountB?.handle ?? "conta");

  const asIs = await supabase
    .from("partidas")
    .insert({
      name,
      account_a_id: sideAAccountId,
      account_b_id: sideBAccountId,
      live_session_id: sideALiveSessionId,
      opponent_live_session_id: sideBLiveSessionId,
    })
    .select("id, account_a_id, account_b_id, live_session_id, opponent_live_session_id")
    .single();
  if (!asIs.error && asIs.data) return asIs.data as LivePartidaRow;

  const swapped = await supabase
    .from("partidas")
    .insert({
      name,
      account_a_id: sideBAccountId,
      account_b_id: sideAAccountId,
      live_session_id: sideBLiveSessionId,
      opponent_live_session_id: sideALiveSessionId,
    })
    .select("id, account_a_id, account_b_id, live_session_id, opponent_live_session_id")
    .single();
  if (!swapped.error && swapped.data) return swapped.data as LivePartidaRow;

  return null;
}

// Confrontos between a player on one streamer's live and a player on
// another's — see cross_account_matches (20260724000025). No scoring_rule/
// points here on purpose: this phase only builds the pairing, scoring is
// setCrossAccountMatchPoints below.
//
// Side A / Side B are symmetric — unlike the old account-nested version,
// there's no "my account" here (this screen isn't scoped to one anymore).
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
  if (sideAAccountId === sideBAccountId) {
    return { error: "As duas contas são a mesma — selecione uma conta diferente para o outro lado." };
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

  const partida = await resolvePartida(supabase, {
    sideAAccountId,
    sideALiveSessionId,
    sideBAccountId,
    sideBLiveSessionId,
  });
  if (!partida) {
    return { error: "Você precisa ter acesso a um dos dois streamers para criar essa partida." };
  }

  const playerForLive = (liveId: string) => (liveId === sideALiveSessionId ? sideAPlayerId : sideBPlayerId);

  const asIs = await supabase.from("cross_account_matches").insert({
    account_id: partida.account_a_id,
    live_session_id: partida.live_session_id,
    player_id: playerForLive(partida.live_session_id),
    opponent_account_id: partida.account_b_id,
    opponent_live_session_id: partida.opponent_live_session_id,
    opponent_player_id: playerForLive(partida.opponent_live_session_id),
    partida_id: partida.id,
    created_by: user.id,
  });

  if (asIs.error) {
    const swapped = await supabase.from("cross_account_matches").insert({
      account_id: partida.account_b_id,
      live_session_id: partida.opponent_live_session_id,
      player_id: playerForLive(partida.opponent_live_session_id),
      opponent_account_id: partida.account_a_id,
      opponent_live_session_id: partida.live_session_id,
      opponent_player_id: playerForLive(partida.live_session_id),
      partida_id: partida.id,
      created_by: user.id,
    });
    if (swapped.error) {
      return { error: "Você precisa ter acesso a um dos dois streamers para criar essa partida." };
    }
  }

  revalidatePath("/admin/partidas/criar");
  revalidatePath(`/admin/partidas/criar/${partida.id}`);
  revalidatePath("/admin/partidas/jogar");
  return { success: "Confronto adicionado." };
}

type CachetaoPartidaRow = {
  id: string;
  account_a_id: string;
  account_b_id: string;
  cachetao_event_id: string;
  opponent_cachetao_event_id: string;
};

// Same as resolvePartida above, but the pairing is between two Cachetão
// events instead of two lives — kept as a separate function rather than a
// parametrized one, since the two flows are reached from entirely different
// screens and never mix sources within one partida.
async function resolveCachetaoPartida(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sides: { sideAAccountId: string; sideAEventId: string; sideBAccountId: string; sideBEventId: string },
): Promise<CachetaoPartidaRow | null> {
  const { sideAAccountId, sideAEventId, sideBAccountId, sideBEventId } = sides;

  const { data: existing } = await supabase
    .from("partidas")
    .select("id, account_a_id, account_b_id, cachetao_event_id, opponent_cachetao_event_id")
    .or(
      `and(cachetao_event_id.eq.${sideAEventId},opponent_cachetao_event_id.eq.${sideBEventId}),` +
        `and(cachetao_event_id.eq.${sideBEventId},opponent_cachetao_event_id.eq.${sideAEventId})`,
    )
    .not("cachetao_event_id", "is", null)
    .maybeSingle();
  if (existing) return existing as CachetaoPartidaRow;

  const [{ data: accountA }, { data: accountB }] = await Promise.all([
    supabase.from("tiktok_accounts").select("handle").eq("id", sideAAccountId).maybeSingle(),
    supabase.from("tiktok_accounts").select("handle").eq("id", sideBAccountId).maybeSingle(),
  ]);
  const name = buildPartidaName(accountA?.handle ?? "conta", accountB?.handle ?? "conta");

  const asIs = await supabase
    .from("partidas")
    .insert({
      name,
      account_a_id: sideAAccountId,
      account_b_id: sideBAccountId,
      cachetao_event_id: sideAEventId,
      opponent_cachetao_event_id: sideBEventId,
    })
    .select("id, account_a_id, account_b_id, cachetao_event_id, opponent_cachetao_event_id")
    .single();
  if (!asIs.error && asIs.data) return asIs.data as CachetaoPartidaRow;

  const swapped = await supabase
    .from("partidas")
    .insert({
      name,
      account_a_id: sideBAccountId,
      account_b_id: sideAAccountId,
      cachetao_event_id: sideBEventId,
      opponent_cachetao_event_id: sideAEventId,
    })
    .select("id, account_a_id, account_b_id, cachetao_event_id, opponent_cachetao_event_id")
    .single();
  if (!swapped.error && swapped.data) return swapped.data as CachetaoPartidaRow;

  return null;
}

// Same shape as createCrossAccountMatch, but each side's player comes from a
// Cachetão event's registrations instead of a live's participants — only
// registrations still "in play" (not cancelled/no_show) are eligible.
export async function createCachetaoCrossAccountMatch(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sideAAccountId = String(formData.get("side_a_account_id") ?? "");
  const sideAEventId = String(formData.get("side_a_cachetao_event_id") ?? "");
  const sideAPlayerId = String(formData.get("side_a_player_id") ?? "");
  const sideBAccountId = String(formData.get("side_b_account_id") ?? "");
  const sideBEventId = String(formData.get("side_b_cachetao_event_id") ?? "");
  const sideBPlayerId = String(formData.get("side_b_player_id") ?? "");

  if (!sideAEventId || !sideAPlayerId || !sideBEventId || !sideBPlayerId) {
    return { error: "Selecione um jogador de cada lado." };
  }
  if (sideAPlayerId === sideBPlayerId) {
    return { error: "Selecione dois jogadores diferentes." };
  }
  if (sideAAccountId === sideBAccountId) {
    return { error: "As duas contas são a mesma — selecione uma conta diferente para o outro lado." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada, faça login novamente." };

  const isEligible = async (eventId: string, playerId: string) => {
    const { data } = await supabase
      .from("cachetao_registrations")
      .select("player_id")
      .eq("cachetao_event_id", eventId)
      .eq("player_id", playerId)
      .in("status", ["confirmed", "called_up"])
      .maybeSingle();
    return !!data;
  };
  const [aOk, bOk] = await Promise.all([
    isEligible(sideAEventId, sideAPlayerId),
    isEligible(sideBEventId, sideBPlayerId),
  ]);
  if (!aOk || !bOk) {
    return { error: "Os dois jogadores precisam estar inscritos (e presentes) nos respectivos Caxetões." };
  }

  const partida = await resolveCachetaoPartida(supabase, {
    sideAAccountId,
    sideAEventId,
    sideBAccountId,
    sideBEventId,
  });
  if (!partida) {
    return { error: "Você precisa ter acesso a um dos dois streamers para criar essa partida." };
  }

  const playerForEvent = (eventId: string) => (eventId === sideAEventId ? sideAPlayerId : sideBPlayerId);

  const asIs = await supabase.from("cross_account_matches").insert({
    account_id: partida.account_a_id,
    cachetao_event_id: partida.cachetao_event_id,
    player_id: playerForEvent(partida.cachetao_event_id),
    opponent_account_id: partida.account_b_id,
    opponent_cachetao_event_id: partida.opponent_cachetao_event_id,
    opponent_player_id: playerForEvent(partida.opponent_cachetao_event_id),
    partida_id: partida.id,
    created_by: user.id,
  });

  if (asIs.error) {
    const swapped = await supabase.from("cross_account_matches").insert({
      account_id: partida.account_b_id,
      cachetao_event_id: partida.opponent_cachetao_event_id,
      player_id: playerForEvent(partida.opponent_cachetao_event_id),
      opponent_account_id: partida.account_a_id,
      opponent_cachetao_event_id: partida.cachetao_event_id,
      opponent_player_id: playerForEvent(partida.cachetao_event_id),
      partida_id: partida.id,
      created_by: user.id,
    });
    if (swapped.error) {
      return { error: "Você precisa ter acesso a um dos dois streamers para criar essa partida." };
    }
  }

  revalidatePath("/admin/cachetao/criar");
  revalidatePath(`/admin/cachetao/criar/${partida.id}`);
  revalidatePath("/admin/cachetao/jogar");
  return { success: "Confronto adicionado." };
}

// Deletes the ranking-credit side effect of a previously-launched Cachetão
// result (see setCrossAccountMatchPoints) — called whenever the winner
// changes or the confronto itself is removed, so a stale mirrored match
// never keeps crediting an account that isn't actually correct anymore. No-op
// (and harmless) for live-sourced confrontos, which never have one.
async function deleteMirroredMatch(supabase: ReturnType<typeof createServiceClient>, matchId: string) {
  await supabase.from("matches").delete().eq("source_cross_account_match_id", matchId);
}

// Changing the winner invalidates any points already launched for the old
// one (the <select> was scoped to the old winner's own scoring_rules
// context and the ranking credit, if any, belongs to the wrong account now)
// — clear both rather than leaving stale data silently mislabeled as
// belonging to the new winner.
export async function setCrossAccountMatchWinner(formData: FormData) {
  const matchId = String(formData.get("match_id") ?? "");
  const winner = String(formData.get("winner") ?? "");
  if (!matchId || (winner !== "player" && winner !== "opponent")) return;

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("cross_account_matches")
    .select("winner, points_awarded, live_session_id, opponent_live_session_id, cachetao_event_id, opponent_cachetao_event_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!current) return;

  await supabase.from("cross_account_matches").update({ winner }).eq("id", matchId);

  if (current.winner !== winner && current.points_awarded !== null) {
    await supabase
      .from("cross_account_matches")
      .update({ scoring_rule_id: null, points_awarded: null })
      .eq("id", matchId);
    await deleteMirroredMatch(createServiceClient(), matchId);
  }

  revalidateConfrontoPaths(current);
}

// The points "execution" screen — see 20260724000027. Requires a winner to
// already be set (points belong to a specific player, not an undetermined
// confronto). scoring_rules is global (20260725000028) — no longer scoped
// per account, so any active rule can apply to whichever side won.
//
// Cachetão-sourced confrontos additionally mirror the result into a real
// `matches`/`match_results` row for the WINNER's own account, so it counts
// toward that account's regular ranking — a deliberate exception to the
// "cross_account_matches never touches ranking" isolation everywhere else in
// this file, decided explicitly for this one flow. Requires the winner's
// account to have an open score_period; blocked otherwise rather than
// silently losing the points or attributing them to no period at all.
export async function setCrossAccountMatchPoints(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const matchId = String(formData.get("match_id") ?? "");
  const scoringRuleId = String(formData.get("scoring_rule_id") ?? "");
  if (!matchId || !scoringRuleId) return { error: "Selecione a pontuação." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada, faça login novamente." };

  const { data: match } = await supabase
    .from("cross_account_matches")
    .select(
      "winner, account_id, opponent_account_id, player_id, opponent_player_id, live_session_id, opponent_live_session_id, cachetao_event_id, opponent_cachetao_event_id",
    )
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

  const isCachetao = !!match.cachetao_event_id;
  let winnerAccountId: string | null = null;
  let winnerEventId: string | null = null;
  let winnerPlayerId: string | null = null;

  if (isCachetao) {
    winnerAccountId = match.winner === "player" ? match.account_id : match.opponent_account_id;
    winnerEventId = match.winner === "player" ? match.cachetao_event_id : match.opponent_cachetao_event_id;
    winnerPlayerId = match.winner === "player" ? match.player_id : match.opponent_player_id;

    const { data: openPeriod } = await supabase
      .from("score_periods")
      .select("id")
      .eq("tiktok_account_id", winnerAccountId!)
      .eq("status", "open")
      .maybeSingle();
    if (!openPeriod) {
      return {
        error: "A conta do vencedor não tem um período de ranking aberto — abra um período nessa conta antes de lançar a pontuação.",
      };
    }

    // Service role: the admin managing this confronto may only have
    // has_account_access on the LOSING side (cross_account_matches allows
    // either side to manage a shared confronto), but crediting the winner's
    // ranking is a side effect of an action they're already authorized to
    // take on the confronto itself, not a fresh authorization decision.
    const service = createServiceClient();
    const { data: existingMirror } = await service
      .from("matches")
      .select("id")
      .eq("source_cross_account_match_id", matchId)
      .maybeSingle();

    const matchRow = existingMirror
      ? existingMirror
      : (
          await service
            .from("matches")
            .insert({
              tiktok_account_id: winnerAccountId!,
              cachetao_event_id: winnerEventId!,
              score_period_id: openPeriod.id,
              source_cross_account_match_id: matchId,
            })
            .select("id")
            .single()
        ).data;
    if (!matchRow) return { error: "Falha ao registrar o resultado no ranking." };

    const { error: resultError } = await service.from("match_results").upsert(
      {
        match_id: matchRow.id,
        player_id: winnerPlayerId!,
        scoring_rule_id: scoringRuleId,
        points_awarded: rule.points,
        recorded_by: user.id,
      },
      { onConflict: "match_id,player_id" },
    );
    if (resultError) return { error: resultError.message };
  }

  const { error } = await supabase
    .from("cross_account_matches")
    .update({ scoring_rule_id: scoringRuleId, points_awarded: rule.points })
    .eq("id", matchId);
  if (error) return { error: error.message };

  revalidateConfrontoPaths(match);
  if (isCachetao) revalidatePath(`/admin/${winnerAccountId}/ranking`);
  return { success: "Resultado salvo." };
}

// Swaps one side of an already-created confronto for a different player from
// the same source (live or Cachetão event), instead of removing + recreating
// the whole row. "player" pulls from that confronto's own source, "opponent"
// from its own opponent source — always the row's actual sides, never
// whatever happens to be selected in the "criar" form.
export async function swapCrossAccountMatchPlayer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const matchId = String(formData.get("match_id") ?? "");
  const side = String(formData.get("side") ?? "");
  const newPlayerId = String(formData.get("new_player_id") ?? "");

  if (!matchId || !newPlayerId || (side !== "player" && side !== "opponent")) {
    return { error: "Selecione um jogador." };
  }

  const supabase = await createClient();

  const { data: match } = await supabase
    .from("cross_account_matches")
    .select("live_session_id, opponent_live_session_id, cachetao_event_id, opponent_cachetao_event_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return { error: "Confronto não encontrado." };

  const poolLiveId = side === "player" ? match.live_session_id : match.opponent_live_session_id;
  const poolEventId = side === "player" ? match.cachetao_event_id : match.opponent_cachetao_event_id;

  let eligible = false;
  if (poolLiveId) {
    const { data } = await supabase
      .from("live_participants")
      .select("player_id")
      .eq("live_session_id", poolLiveId)
      .eq("player_id", newPlayerId)
      .maybeSingle();
    eligible = !!data;
  } else if (poolEventId) {
    const { data } = await supabase
      .from("cachetao_registrations")
      .select("player_id")
      .eq("cachetao_event_id", poolEventId)
      .eq("player_id", newPlayerId)
      .in("status", ["confirmed", "called_up"])
      .maybeSingle();
    eligible = !!data;
  }
  if (!eligible) return { error: "Esse jogador não é participante dessa live/Cachetão." };

  const { error } = await supabase
    .from("cross_account_matches")
    .update(side === "player" ? { player_id: newPlayerId } : { opponent_player_id: newPlayerId })
    .eq("id", matchId);
  if (error) {
    return {
      error: error.code === "23514" ? "Os dois jogadores precisam ser diferentes." : error.message,
    };
  }

  revalidateConfrontoPaths(match);
  return { success: "Jogador trocado." };
}

export async function removeCrossAccountMatch(formData: FormData) {
  const matchId = String(formData.get("match_id") ?? "");
  if (!matchId) return;

  const supabase = await createClient();

  const { data: match } = await supabase
    .from("cross_account_matches")
    .select("live_session_id, opponent_live_session_id, cachetao_event_id, opponent_cachetao_event_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return;

  await deleteMirroredMatch(createServiceClient(), matchId);
  await supabase.from("cross_account_matches").delete().eq("id", matchId);

  revalidateConfrontoPaths(match);
}
