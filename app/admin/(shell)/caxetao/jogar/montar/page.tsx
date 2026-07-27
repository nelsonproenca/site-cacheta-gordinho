import { createClient } from "@/lib/supabase/server";
import { CaxetaoConfrontoSection } from "./caxetao-confronto-section";

// Global entry point (not nested under an account) — pick 2 accounts, each
// account's own Caxetão with registrations already settled, and a
// registered player from it, to build a confronto. Mirrors
// /admin/partidas/criar, sourced from caxetao_registrations instead of
// live_participants.
export default async function MontarCaxetaoConfrontoPage() {
  const supabase = await createClient();

  const [{ data: accounts }, { data: eventRows }] = await Promise.all([
    supabase
      .from("tiktok_accounts")
      .select("id, handle, display_name")
      .eq("is_active", true)
      .order("display_name", { ascending: true }),
    supabase
      .from("caxetao_events")
      .select("id, event_date, tiktok_account_id, status")
      .in("status", ["registrations_closed", "in_progress"]),
  ]);

  const events = eventRows ?? [];
  const eventIds = events.map((e) => e.id);
  const { data: registrationRows } = eventIds.length
    ? await supabase
        .from("caxetao_registrations")
        .select("caxetao_event_id, status, players(id, display_name, tiktok_handle)")
        .in("caxetao_event_id", eventIds)
        .in("status", ["confirmed", "called_up"])
    : { data: [] };

  const eventParticipants: Record<string, { id: string; display_name: string; tiktok_handle: string }[]> = {};
  for (const row of registrationRows ?? []) {
    if (!row.players) continue;
    (eventParticipants[row.caxetao_event_id] ??= []).push(row.players);
  }

  const { data: confrontoRows } = await supabase
    .from("cross_account_matches")
    .select(
      `id, caxetao_event_id, opponent_caxetao_event_id,
       player:players!cross_account_matches_player_id_fkey(id, display_name, tiktok_handle),
       opponent_player:players!cross_account_matches_opponent_player_id_fkey(id, display_name, tiktok_handle)`,
    )
    .not("caxetao_event_id", "is", null)
    .order("created_at", { ascending: true });

  const confrontos = (confrontoRows ?? [])
    .filter((c) => c.player && c.opponent_player && c.caxetao_event_id && c.opponent_caxetao_event_id)
    .map((c) => ({
      id: c.id,
      caxetaoEventId: c.caxetao_event_id!,
      opponentCaxetaoEventId: c.opponent_caxetao_event_id!,
      player: c.player!,
      opponentPlayer: c.opponent_player!,
    }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Montar confronto</h1>
        <p className="text-ink-dim">
          Escolha uma conta e um jogador inscrito no Caxetão dela (com inscrições já encerradas), dos dois lados.
        </p>
      </div>

      <CaxetaoConfrontoSection
        accounts={accounts ?? []}
        events={events}
        eventParticipants={eventParticipants}
        confrontos={confrontos}
      />
    </div>
  );
}
