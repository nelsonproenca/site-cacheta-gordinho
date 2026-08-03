"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { waitForIceGathering } from "./webrtc-utils";

// Hand-rolled WHEP playback (~100 lines, no new dependency, per user
// decision) — recvonly transceivers, single HTTP POST/response SDP
// exchange with MediaMTX's WHEP endpoint. Starts muted (browser autoplay
// policy blocks unmuted autoplay) with an explicit "Ativar som" button.
export function WhepPlayer({ playbackUrl, broadcastId }: { playbackUrl: string; broadcastId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  // Per the WHEP spec, the POST response's Location header names a
  // per-session resource URL that DELETE terminates — closing it properly
  // frees the reader session immediately instead of waiting out a timeout.
  const resourceUrlRef = useRef<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [status, setStatus] = useState<"connecting" | "playing" | "ended" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);

  function disconnect() {
    if (resourceUrlRef.current) {
      fetch(resourceUrlRef.current, { method: "DELETE" }).catch(() => {});
      resourceUrlRef.current = null;
    }
    pcRef.current?.close();
    pcRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => {
    let cancelled = false;
    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    pc.ontrack = (event) => {
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
      }
    };

    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    async function connect() {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIceGathering(pc);

        const response = await fetch(playbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: pc.localDescription?.sdp,
        });
        if (!response.ok) throw new Error(`Playback falhou (HTTP ${response.status})`);

        const location = response.headers.get("Location");
        resourceUrlRef.current = location ? new URL(location, playbackUrl).toString() : null;

        const answerSdp = await response.text();
        if (cancelled) return;
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
        setStatus("playing");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : "Falha ao conectar na live");
      }
    }

    connect();

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [playbackUrl]);

  // The watch page only fetches get_live_broadcast_public once, on the
  // server, when the page first loads — a player who leaves the tab open
  // has no other way to find out the streamer ended the broadcast (or the
  // admin force-ended it) than this. Polling the same player-safe RPC and
  // disconnecting once it stops returning a live playback_path is what
  // actually ends the session on this side, instead of leaving the video
  // frozen on the last frame forever.
  useEffect(() => {
    if (status !== "playing") return;
    const supabase = createClient();
    const interval = setInterval(async () => {
      const { data } = await supabase.rpc("get_live_broadcast_public", { p_id: broadcastId });
      if (!data?.[0]?.playback_path) {
        disconnect();
        setStatus("ended");
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [status, broadcastId]);

  if (status === "ended") {
    return <p className="text-ink-dim text-sm">Esta transmissão foi encerrada.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full aspect-video rounded-[var(--radius-lg)] bg-carbon"
      />
      {status === "connecting" && <p className="text-ink-dim text-sm">Conectando na live...</p>}
      {status === "error" && <p className="error-text">{error}</p>}
      {status === "playing" && muted && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setMuted(false)}>
          Ativar som
        </Button>
      )}
    </div>
  );
}
