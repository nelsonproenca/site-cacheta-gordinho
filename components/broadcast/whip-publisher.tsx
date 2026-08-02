"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { waitForIceGathering } from "./webrtc-utils";

// Hand-rolled WHIP publish (~100 lines, no new dependency) — symmetric to
// WhepPlayer's playback side. getUserMedia captures the streamer's own
// camera/mic, a single HTTP POST of the SDP offer to MediaMTX's WHIP
// endpoint gets back the answer (no trickle ICE signaling channel needed).
export function WhipPublisher({ publishUrl }: { publishUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Per the WHIP spec, the POST response's Location header names a
  // per-session resource URL that DELETE terminates — closing it properly
  // lets MediaMTX free the path immediately instead of waiting out an
  // ICE/RTP timeout.
  const resourceUrlRef = useRef<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "live" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStatus("starting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);

      const response = await fetch(publishUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription?.sdp,
      });
      if (!response.ok) throw new Error(`Publish falhou (HTTP ${response.status})`);

      const location = response.headers.get("Location");
      resourceUrlRef.current = location ? new URL(location, publishUrl).toString() : null;

      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setStatus("live");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Falha ao iniciar transmissão");
      stop();
    }
  }

  function stop() {
    if (resourceUrlRef.current) {
      // Best-effort — the tab may be closing, don't block on the response.
      fetch(resourceUrlRef.current, { method: "DELETE" }).catch(() => {});
      resourceUrlRef.current = null;
    }
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus((s) => (s === "error" ? s : "idle"));
  }

  return (
    <div className="flex flex-col gap-3">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full aspect-video rounded-[var(--radius-lg)] bg-carbon"
      />
      {error && <p className="error-text">{error}</p>}
      {status === "live" ? (
        <Button type="button" variant="outline" onClick={stop}>
          Parar câmera
        </Button>
      ) : (
        <Button type="button" onClick={start} disabled={status === "starting"}>
          {status === "starting" ? "Conectando..." : "Ligar câmera e transmitir"}
        </Button>
      )}
    </div>
  );
}
