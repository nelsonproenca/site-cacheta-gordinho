"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { waitForIceGathering } from "./webrtc-utils";

// Hand-rolled WHEP playback (~100 lines, no new dependency, per user
// decision) — recvonly transceivers, single HTTP POST/response SDP
// exchange with MediaMTX's WHEP endpoint. Starts muted (browser autoplay
// policy blocks unmuted autoplay) with an explicit "Ativar som" button.
export function WhepPlayer({ playbackUrl }: { playbackUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [status, setStatus] = useState<"connecting" | "playing" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Per the WHEP spec, the POST response's Location header names a
    // per-session resource URL that DELETE terminates — closing it properly
    // frees the reader session immediately instead of waiting out a timeout.
    let resourceUrl: string | null = null;
    const pc = new RTCPeerConnection();

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
        resourceUrl = location ? new URL(location, playbackUrl).toString() : null;

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
      if (resourceUrl) {
        fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
      }
      pc.close();
    };
  }, [playbackUrl]);

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
