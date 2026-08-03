import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { endBroadcastManually } from "@/lib/actions/live-broadcasts";
import { buildRtmpPublishUrl, buildWhipPublishUrl } from "@/lib/mediamtx";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WhipPublisher } from "@/components/broadcast/whip-publisher";
import { LiveChat, MutedPlayersList } from "@/components/broadcast/live-chat";

const STATUS_LABEL: Record<string, string> = {
  created: "Preparando",
  live: "Ao vivo",
  ended: "Encerrada",
};

const STATUS_VARIANT: Record<string, "green" | "yellow" | "neutral"> = {
  created: "yellow",
  live: "green",
  ended: "neutral",
};

export default async function BroadcastDetailPage({
  params,
}: {
  params: Promise<{ accountId: string; broadcastId: string }>;
}) {
  const { accountId, broadcastId } = await params;
  const supabase = await createClient();
  const { data: broadcast } = await supabase
    .from("live_broadcasts")
    .select("id, status, title, stream_key")
    .eq("id", broadcastId)
    .maybeSingle();

  if (!broadcast) notFound();

  const { data: muteRows } = await supabase
    .from("live_chat_mutes")
    .select("player_id, players(display_name, tiktok_handle)")
    .eq("live_broadcast_id", broadcastId);

  const mutes = (muteRows ?? [])
    .filter((m) => m.players)
    .map((m) => ({
      player_id: m.player_id,
      display_name: m.players!.display_name,
      tiktok_handle: m.players!.tiktok_handle,
    }));

  const returnPath = `/admin/${accountId}/live/${broadcastId}`;
  // Matches mediamtx.yml's `~^live_(.+)$` paths pattern — built here, not in
  // lib/mediamtx.ts, so the prefix isn't duplicated in two places.
  const mediamtxPath = `live_${broadcast.stream_key}`;

  // The VPS/MediaMTX side isn't wired up in every environment yet (prd.md
  // §12) — buildXUrl (lib/mediamtx.ts) throws if its env vars are unset, so
  // this page degrades to showing the stream key/status instead of crashing.
  const mediamtxConfigured = Boolean(
    process.env.MEDIAMTX_RTMP_HOST && process.env.MEDIAMTX_PUBLIC_URL,
  );

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-display italic font-bold text-xl uppercase">Transmissão</span>
          <Badge variant={STATUS_VARIANT[broadcast.status] ?? "neutral"}>
            {STATUS_LABEL[broadcast.status] ?? broadcast.status}
          </Badge>
        </div>
        {broadcast.status !== "ended" && (
          <form action={endBroadcastManually}>
            <input type="hidden" name="broadcast_id" value={broadcastId} />
            <input type="hidden" name="account_id" value={accountId} />
            <Button type="submit" variant="outline" size="sm">
              Encerrar transmissão
            </Button>
          </form>
        )}
      </Card>

      {broadcast.status !== "ended" && (
        <Card className="flex flex-col gap-4">
          <h2 className="font-display italic font-bold text-xl uppercase">Publicar</h2>

          {!mediamtxConfigured ? (
            <p className="text-ink-dim text-sm">
              A infraestrutura de streaming ainda não foi configurada neste ambiente.
            </p>
          ) : (
            <>
              <WhipPublisher publishUrl={buildWhipPublishUrl(mediamtxPath)} broadcastId={broadcastId} />
              <div className="text-sm text-ink-dim">
                <p>Prefere usar OBS ou outro software? Publique via RTMP:</p>
                <p className="mono-data break-all">{buildRtmpPublishUrl(mediamtxPath)}</p>
              </div>
            </>
          )}
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="font-display italic font-bold text-xl uppercase">Chat</h2>
        <MutedPlayersList broadcastId={broadcastId} returnPath={returnPath} mutes={mutes} />
        <LiveChat broadcastId={broadcastId} isModerator returnPath={returnPath} />
      </Card>
    </div>
  );
}
