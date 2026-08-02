// Shared by whip-publisher.tsx and whep-player.tsx — both are single-shot
// WHIP/WHEP HTTP exchanges (no trickle ICE signaling channel), so the local
// SDP must be final (all candidates gathered) before it's POSTed.
export function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    function check() {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    }
    pc.addEventListener("icegatheringstatechange", check);
  });
}
