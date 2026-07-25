import { createClient } from "@/lib/supabase/server";
import { CriarPartidaSection } from "./criar-partida-section";

// Global entry point (not nested under an account) — pick 2 accounts, each
// account's own open live, and a player from it, to build a confronto.
// Picking straight from tiktok_accounts (public data, same as the rest of
// the site) instead of going through streamer identity first — an account
// is unambiguous even for a streamer who owns more than one.
export default async function CriarPartidaPage() {
  const supabase = await createClient();

  const [{ data: accounts }, { data: liveRows }] = await Promise.all([
    supabase
      .from("tiktok_accounts")
      .select("id, handle, display_name")
      .eq("is_active", true)
      .order("display_name", { ascending: true }),
    supabase
      .from("live_sessions")
      .select("id, session_date, tiktok_account_id")
      .eq("status", "open"),
  ]);

  const lives = liveRows ?? [];
  const liveIds = lives.map((l) => l.id);
  const { data: participantRows } = liveIds.length
    ? await supabase
        .from("live_participants")
        .select("live_session_id, players(id, display_name, tiktok_handle)")
        .in("live_session_id", liveIds)
    : { data: [] };

  const liveParticipants: Record<string, { id: string; display_name: string; tiktok_handle: string }[]> = {};
  for (const row of participantRows ?? []) {
    if (!row.players) continue;
    (liveParticipants[row.live_session_id] ??= []).push(row.players);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Nova partida</h1>
        <p className="text-ink-dim">Escolha uma conta e um jogador da live aberta dela, dos dois lados.</p>
      </div>

      <CriarPartidaSection accounts={accounts ?? []} lives={lives} liveParticipants={liveParticipants} />
    </div>
  );
}
