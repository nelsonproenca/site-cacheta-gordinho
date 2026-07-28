import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { CachetaoConfrontoSection } from "../cachetao-confronto-section";

// Editing an existing Cachetão-sourced partida — reopened from
// /admin/cachetao/jogar's "Editar" link. Mirrors
// /admin/partidas/criar/[partidaId]: the two sides are immutable once a
// partida exists (no update policy on partidas at all — 20260727000030),
// so this page only ever renders them as read-only text; only the player
// picker (sourced from a fresh cachetao_registrations query on every visit,
// so late sign-ups/promotions show up) and the confrontos table (add/swap/
// remove) stay interactive — and only while both Caxetões haven't finished.
export default async function EditarCachetaoPartidaPage({
  params,
}: {
  params: Promise<{ partidaId: string }>;
}) {
  const { partidaId } = await params;
  const supabase = await createClient();

  const { data: partida } = await supabase
    .from("partidas")
    .select(
      `id, name, cachetao_event_id, opponent_cachetao_event_id,
       account_a:tiktok_accounts!partidas_account_a_id_fkey(id, handle),
       account_b:tiktok_accounts!partidas_account_b_id_fkey(id, handle)`,
    )
    .eq("id", partidaId)
    .maybeSingle();

  if (
    !partida ||
    !partida.account_a ||
    !partida.account_b ||
    !partida.cachetao_event_id ||
    !partida.opponent_cachetao_event_id
  ) {
    notFound();
  }

  const eventIds = [partida.cachetao_event_id, partida.opponent_cachetao_event_id];
  const [{ data: eventRows }, { data: registrationRows }] = await Promise.all([
    supabase.from("cachetao_events").select("id, status").in("id", eventIds),
    supabase
      .from("cachetao_registrations")
      .select("cachetao_event_id, status, players(id, display_name, tiktok_handle)")
      .in("cachetao_event_id", eventIds)
      .in("status", ["confirmed", "called_up"]),
  ]);

  const bothEventsActive = eventIds.every((id) => eventRows?.find((e) => e.id === id)?.status !== "finished");

  const eventParticipants: Record<string, { id: string; display_name: string; tiktok_handle: string }[]> = {};
  for (const row of registrationRows ?? []) {
    if (!row.players) continue;
    (eventParticipants[row.cachetao_event_id] ??= []).push(row.players);
  }

  const { data: confrontoRows } = await supabase
    .from("cross_account_matches")
    .select(
      `id, cachetao_event_id, opponent_cachetao_event_id, winner, points_awarded,
       player:players!cross_account_matches_player_id_fkey(id, display_name, tiktok_handle),
       opponent_player:players!cross_account_matches_opponent_player_id_fkey(id, display_name, tiktok_handle),
       scoring_rules(name)`,
    )
    .eq("partida_id", partidaId)
    .order("created_at", { ascending: true });

  const confrontos = (confrontoRows ?? [])
    .filter((c) => c.player && c.opponent_player && c.cachetao_event_id && c.opponent_cachetao_event_id)
    .map((c) => ({
      id: c.id,
      cachetaoEventId: c.cachetao_event_id!,
      opponentCachetaoEventId: c.opponent_cachetao_event_id!,
      player: c.player!,
      opponentPlayer: c.opponent_player!,
      winner: c.winner as "player" | "opponent" | null,
      scoringRuleName: c.scoring_rules?.name ?? null,
      pointsAwarded: c.points_awarded,
    }));

  let winsA = 0;
  let winsB = 0;
  for (const c of confrontos) {
    if (!c.winner) continue;
    const accountAWon = c.winner === (c.cachetaoEventId === partida.cachetao_event_id ? "player" : "opponent");
    if (accountAWon) winsA += 1;
    else winsB += 1;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">
          {bothEventsActive ? "Editar partida" : "Ver partida"}
        </h1>
        <p className="text-ink-dim">
          {bothEventsActive
            ? "Adicione mais confrontos ou troque jogadores — as contas não podem mudar."
            : "Um dos Caxetões dessa partida já terminou — apenas consulta, sem adicionar, trocar ou remover confrontos."}
        </p>
      </div>

      {!bothEventsActive && (
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

      <CachetaoConfrontoSection
        accounts={[]}
        events={[]}
        eventParticipants={eventParticipants}
        confrontos={confrontos}
        readOnly={!bothEventsActive}
        lockedPartida={{
          id: partida.id,
          name: partida.name,
          accountAId: partida.account_a.id,
          accountAHandle: partida.account_a.handle,
          cachetaoEventId: partida.cachetao_event_id,
          accountBId: partida.account_b.id,
          accountBHandle: partida.account_b.handle,
          opponentCachetaoEventId: partida.opponent_cachetao_event_id,
        }}
      />
    </div>
  );
}
