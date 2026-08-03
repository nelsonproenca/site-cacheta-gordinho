import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildWhepPlaybackUrl } from "@/lib/mediamtx";
import { Badge } from "@/components/ui/badge";
import { WhepPlayer } from "@/components/broadcast/whep-player";
import { LiveChat } from "@/components/broadcast/live-chat";

export default async function WatchBroadcastPage({
  params,
}: {
  params: Promise<{ broadcastId: string }>;
}) {
  const { broadcastId } = await params;
  const supabase = await createClient();

  const { data: rows } = await supabase.rpc("get_live_broadcast_public", { p_id: broadcastId });
  const broadcast = rows?.[0];
  if (!broadcast) notFound();

  const { data: account } = await supabase
    .from("tiktok_accounts")
    .select("handle, display_name")
    .eq("id", broadcast.tiktok_account_id)
    .maybeSingle();

  const mediamtxConfigured = Boolean(process.env.MEDIAMTX_PUBLIC_URL);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl italic font-extrabold uppercase">
          @{account?.handle ?? "?"}
        </h1>
        <Badge variant={broadcast.status === "live" ? "green" : "neutral"}>
          {broadcast.status === "live" ? "Ao vivo" : "Encerrada"}
        </Badge>
      </div>

      {/* playback_path (20260801000040) is only ever non-null once
          status='live' — MediaMTX serves WHIP (publish) and WHEP (read)
          under the SAME path-based URL, so unlike the original SRS-shaped
          design there's no separate, publish-secret-free identifier to play
          back by. The RPC withholding it until the broadcast is genuinely
          live is what closes the window where a player could otherwise
          pre-emptively publish to that same path themselves; once live,
          MediaMTX's own single-publisher-per-path behavior is the real
          protection against hijacking it (confirmed trade-off — see
          CLAUDE.md's Fase 5 section). */}
      {broadcast.playback_path && !mediamtxConfigured && (
        <p className="text-ink-dim text-sm">A transmissão ainda não está disponível para assistir aqui.</p>
      )}
      {broadcast.playback_path && mediamtxConfigured && (
        <WhepPlayer playbackUrl={buildWhepPlaybackUrl(broadcast.playback_path)} broadcastId={broadcast.id} />
      )}
      {broadcast.status === "created" && (
        <p className="text-ink-dim text-sm">A transmissão ainda não começou.</p>
      )}
      {broadcast.status === "ended" && <p className="text-ink-dim text-sm">Esta transmissão já foi encerrada.</p>}

      {broadcast.status === "live" && (
        <LiveChat broadcastId={broadcast.id} isModerator={false} returnPath={`/ao-vivo/${broadcast.id}`} />
      )}
    </main>
  );
}
