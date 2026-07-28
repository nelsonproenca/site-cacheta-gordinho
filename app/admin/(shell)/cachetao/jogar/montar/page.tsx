import { createClient } from "@/lib/supabase/server";
import { CachetaoConfrontoSection } from "./cachetao-confronto-section";

// Global entry point (not nested under an account) — pick 2 accounts, each
// account's own Cachetão with registrations already settled, and a
// registered player from it, to build a confronto. Mirrors
// /admin/partidas/criar, sourced from cachetao_registrations instead of
// live_participants.
export default async function MontarCachetaoConfrontoPage() {
  const supabase = await createClient();

  const [{ data: accounts }, { data: eventRows }] = await Promise.all([
    supabase
      .from("tiktok_accounts")
      .select("id, handle, display_name")
      .eq("is_active", true)
      .order("display_name", { ascending: true }),
    supabase
      .from("cachetao_events")
      .select("id, event_date, tiktok_account_id, status")
      .in("status", ["registrations_closed", "in_progress"]),
  ]);

  const events = eventRows ?? [];
  const eventIds = events.map((e) => e.id);
  const { data: registrationRows } = eventIds.length
    ? await supabase
        .from("cachetao_registrations")
        .select("cachetao_event_id, status, players(id, display_name, tiktok_handle)")
        .in("cachetao_event_id", eventIds)
        .in("status", ["confirmed", "called_up"])
    : { data: [] };

  const eventParticipants: Record<string, { id: string; display_name: string; tiktok_handle: string }[]> = {};
  for (const row of registrationRows ?? []) {
    if (!row.players) continue;
    (eventParticipants[row.cachetao_event_id] ??= []).push(row.players);
  }

  const { data: confrontoRows } = await supabase
    .from("cross_account_matches")
    .select(
      `id, cachetao_event_id, opponent_cachetao_event_id,
       player:players!cross_account_matches_player_id_fkey(id, display_name, tiktok_handle),
       opponent_player:players!cross_account_matches_opponent_player_id_fkey(id, display_name, tiktok_handle)`,
    )
    .not("cachetao_event_id", "is", null)
    .order("created_at", { ascending: true });

  const confrontos = (confrontoRows ?? [])
    .filter((c) => c.player && c.opponent_player && c.cachetao_event_id && c.opponent_cachetao_event_id)
    .map((c) => ({
      id: c.id,
      cachetaoEventId: c.cachetao_event_id!,
      opponentCachetaoEventId: c.opponent_cachetao_event_id!,
      player: c.player!,
      opponentPlayer: c.opponent_player!,
    }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Montar confronto</h1>
        <p className="text-ink-dim">
          Escolha uma conta e um jogador inscrito no Cachetão dela (com inscrições já encerradas), dos dois lados.
        </p>
      </div>

      <CachetaoConfrontoSection
        accounts={accounts ?? []}
        events={events}
        eventParticipants={eventParticipants}
        confrontos={confrontos}
      />
    </div>
  );
}
