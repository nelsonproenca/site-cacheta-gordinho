import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CrossStreamerSection } from "../../cross-streamer-section";

export default async function PartidasLivePage({
  params,
}: {
  params: Promise<{ accountId: string; sessionId: string }>;
}) {
  const { accountId, sessionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: session } = await supabase
    .from("live_sessions")
    .select("id, session_date, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) notFound();

  const [{ data: participantRows }, { data: otherStreamers }] = await Promise.all([
    supabase
      .from("live_participants")
      .select("players(id, display_name, tiktok_handle)")
      .eq("live_session_id", sessionId),
    supabase
      .from("admins")
      .select("id, name")
      .eq("user_type", "streamer")
      .eq("status", "approved")
      .neq("id", user.id)
      .order("name", { ascending: true }),
  ]);

  const myPool = (participantRows ?? [])
    .map((row) => row.players)
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const otherStreamerIds = (otherStreamers ?? []).map((s) => s.id);

  const { data: accessRows } = otherStreamerIds.length
    ? await supabase
        .from("admin_account_access")
        .select(
          "admin_id, tiktok_accounts(id, handle, live_sessions(id, session_date, status))",
        )
        .in("admin_id", otherStreamerIds)
    : { data: [] };

  const otherLives = (accessRows ?? []).flatMap((row) => {
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

  const otherLiveIds = otherLives.map((l) => l.id);
  const { data: otherParticipantRows } = otherLiveIds.length
    ? await supabase
        .from("live_participants")
        .select("live_session_id, players(id, display_name, tiktok_handle)")
        .in("live_session_id", otherLiveIds)
    : { data: [] };

  const otherLiveParticipants: Record<string, { id: string; display_name: string; tiktok_handle: string }[]> = {};
  for (const row of otherParticipantRows ?? []) {
    if (!row.players) continue;
    (otherLiveParticipants[row.live_session_id] ??= []).push(row.players);
  }

  const { data: confrontoRows } = await supabase
    .from("cross_account_matches")
    .select(
      `id, winner, opponent_live_session_id,
       player:players!cross_account_matches_player_id_fkey(id, display_name, tiktok_handle),
       opponent_player:players!cross_account_matches_opponent_player_id_fkey(id, display_name, tiktok_handle),
       opponent_account:tiktok_accounts!cross_account_matches_opponent_account_id_fkey(handle)`,
    )
    .eq("live_session_id", sessionId)
    .order("created_at", { ascending: true });

  const confrontos = (confrontoRows ?? [])
    .filter((c) => c.player && c.opponent_player && c.opponent_account)
    .map((c) => ({
      id: c.id,
      winner: c.winner as "player" | "opponent" | null,
      opponentLiveSessionId: c.opponent_live_session_id,
      player: c.player!,
      opponentPlayer: c.opponent_player!,
      opponentAccountHandle: c.opponent_account!.handle,
    }));

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-row items-center justify-between">
        <span className="mono-data text-lg">{formatDateTime(session.session_date)}</span>
        <Badge variant={session.status === "open" ? "green" : "neutral"}>
          {session.status === "open" ? "Aberta" : "Encerrada"}
        </Badge>
      </Card>

      <CrossStreamerSection
        accountId={accountId}
        sessionId={sessionId}
        sourceOpen={session.status === "open"}
        myPool={myPool}
        otherStreamers={otherStreamers ?? []}
        otherLives={otherLives}
        otherLiveParticipants={otherLiveParticipants}
        confrontos={confrontos}
      />
    </div>
  );
}
