import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { closeStaleLiveSessions } from "@/lib/live-sessions";
import { Card } from "@/components/ui/card";
import { CriarPartidaSection } from "../criar-partida-section";

// Editing an existing partida — reopened from /admin/partidas/jogar's
// "Editar" link instead of picking accounts from scratch. The two sides are
// immutable once a partida exists (no update policy on partidas at all,
// 20260727000030), so this page only ever renders them as read-only text;
// only the player picker (sourced from a fresh live_participants query on
// every visit, so new arrivals since creation show up) and the confrontos
// table (add/swap/remove) stay interactive — and only while both lives are
// still open. Once either side's live has ended there's no participant pool
// left to pick from, so the page drops into a plain read-only confrontos
// list instead (no add/swap/remove).
export default async function EditarPartidaPage({
  params,
}: {
  params: Promise<{ partidaId: string }>;
}) {
  const { partidaId } = await params;
  const supabase = await createClient();

  const { data: partida } = await supabase
    .from("partidas")
    .select(
      `id, name, live_session_id, opponent_live_session_id,
       account_a:tiktok_accounts!partidas_account_a_id_fkey(id, handle),
       account_b:tiktok_accounts!partidas_account_b_id_fkey(id, handle)`,
    )
    .eq("id", partidaId)
    .maybeSingle();

  // A partida can now also be Cachetão-sourced (20260728000031) — those live
  // under /admin/cachetao/criar/[partidaId] instead, this route only ever
  // handles the live-sourced kind.
  if (!partida || !partida.account_a || !partida.account_b || !partida.live_session_id || !partida.opponent_live_session_id) {
    notFound();
  }

  await Promise.all([
    closeStaleLiveSessions(supabase, partida.account_a.id),
    closeStaleLiveSessions(supabase, partida.account_b.id),
  ]);

  const liveIds = [partida.live_session_id, partida.opponent_live_session_id];
  const [{ data: liveRows }, { data: participantRows }] = await Promise.all([
    supabase.from("live_sessions").select("id, status").in("id", liveIds),
    supabase
      .from("live_participants")
      .select("live_session_id, players(id, display_name, tiktok_handle)")
      .in("live_session_id", liveIds),
  ]);

  const bothLivesOpen = liveIds.every((id) => liveRows?.find((l) => l.id === id)?.status === "open");

  const liveParticipants: Record<string, { id: string; display_name: string; tiktok_handle: string }[]> = {};
  for (const row of participantRows ?? []) {
    if (!row.players) continue;
    (liveParticipants[row.live_session_id] ??= []).push(row.players);
  }

  const { data: confrontoRows } = await supabase
    .from("cross_account_matches")
    .select(
      `id, live_session_id, opponent_live_session_id, winner, points_awarded,
       player:players!cross_account_matches_player_id_fkey(id, display_name, tiktok_handle),
       opponent_player:players!cross_account_matches_opponent_player_id_fkey(id, display_name, tiktok_handle),
       scoring_rules(name)`,
    )
    .eq("partida_id", partidaId)
    .order("created_at", { ascending: true });

  const confrontos = (confrontoRows ?? [])
    .filter((c) => c.player && c.opponent_player && c.live_session_id && c.opponent_live_session_id)
    .map((c) => ({
      id: c.id,
      liveSessionId: c.live_session_id!,
      opponentLiveSessionId: c.opponent_live_session_id!,
      player: c.player!,
      opponentPlayer: c.opponent_player!,
      winner: c.winner as "player" | "opponent" | null,
      scoringRuleName: c.scoring_rules?.name ?? null,
      pointsAwarded: c.points_awarded,
    }));

  // "Vitórias" placar — 1 per confronto won (not the sum of points_awarded),
  // same accounting as the Desafio dos Influencers win tally. A confronto's
  // own live_session_id may equal either side of the partida (see
  // resolvePartida's try/swap orientation in createCrossAccountMatch), so
  // compare against partida.live_session_id per row rather than assuming it.
  let winsA = 0;
  let winsB = 0;
  for (const c of confrontos) {
    if (!c.winner) continue;
    const accountAWon = c.winner === (c.liveSessionId === partida.live_session_id ? "player" : "opponent");
    if (accountAWon) winsA += 1;
    else winsB += 1;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">
          {bothLivesOpen ? "Editar partida" : "Ver partida"}
        </h1>
        <p className="text-ink-dim">
          {bothLivesOpen
            ? "Adicione mais confrontos ou troque jogadores — as contas não podem mudar."
            : "As lives dessa partida já encerraram — apenas consulta, sem adicionar, trocar ou remover confrontos."}
        </p>
      </div>

      {!bothLivesOpen && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-display italic font-bold text-xl uppercase">Placar</h2>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span>@{partida.account_a.handle}</span>
              <span className="mono-data text-lg">{winsA}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>@{partida.account_b.handle}</span>
              <span className="mono-data text-lg">{winsB}</span>
            </div>
          </div>
        </Card>
      )}

      <CriarPartidaSection
        accounts={[]}
        lives={[]}
        liveParticipants={liveParticipants}
        confrontos={confrontos}
        readOnly={!bothLivesOpen}
        lockedPartida={{
          id: partida.id,
          name: partida.name,
          accountAId: partida.account_a.id,
          accountAHandle: partida.account_a.handle,
          liveSessionId: partida.live_session_id,
          accountBId: partida.account_b.id,
          accountBHandle: partida.account_b.handle,
          opponentLiveSessionId: partida.opponent_live_session_id,
        }}
      />
    </div>
  );
}
