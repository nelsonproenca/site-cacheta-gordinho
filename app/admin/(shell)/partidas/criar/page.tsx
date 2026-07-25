import { createClient } from "@/lib/supabase/server";
import { CriarPartidaSection } from "./criar-partida-section";

// Global entry point (not nested under an account) — pick 2 streamers, one
// of their open lives each, and a player from each, to build a confronto.
// Neither side is "me": lists every approved streamer, including whoever is
// logged in, since a moderador with no account of their own might be
// setting this up between two other streamers.
export default async function CriarPartidaPage() {
  const supabase = await createClient();

  const { data: streamers } = await supabase
    .from("admins")
    .select("id, name")
    .eq("user_type", "streamer")
    .eq("status", "approved")
    .order("name", { ascending: true });

  const streamerIds = (streamers ?? []).map((s) => s.id);

  const { data: accessRows } = streamerIds.length
    ? await supabase
        .from("admin_account_access")
        .select("admin_id, tiktok_accounts(id, handle, live_sessions(id, session_date, status))")
        .in("admin_id", streamerIds)
    : { data: [] };

  const lives = (accessRows ?? []).flatMap((row) => {
    const account = row.tiktok_accounts;
    if (!account) return [];
    return account.live_sessions
      .filter((ls) => ls.status === "open")
      .map((ls) => ({
        id: ls.id,
        session_date: ls.session_date,
        tiktok_account_id: account.id,
        account_handle: account.handle,
        streamer_id: row.admin_id,
      }));
  });

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
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Criar uma partida</h1>
        <p className="text-ink-dim">Escolha um streamer, uma live aberta dele e um jogador, dos dois lados.</p>
      </div>

      <CriarPartidaSection streamers={streamers ?? []} lives={lives} liveParticipants={liveParticipants} />
    </div>
  );
}
