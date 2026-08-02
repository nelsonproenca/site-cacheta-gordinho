// URL builders for the MediaMTX instance running on the user's own VPS —
// this project only integrates with it, doesn't run it. Replaces the
// earlier lib/srs.ts: the original plan assumed SRS, but inspecting the
// real VPS showed it's MediaMTX (already in production for an unrelated
// camera-monitoring product, "Watchtower") — a different media server with
// its own URL/config conventions, confirmed against mediamtx.org/docs
// rather than assumed. Every `path` argument here is expected to already be
// the full MediaMTX path name, e.g. `live_<stream_key>` (matching the
// `~^live_(.+)$` paths pattern in mediamtx.yml) — callers build that prefix
// themselves rather than this file hardcoding it, so it isn't duplicated in
// two places.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} env var — see .env.local.example`);
  return value;
}

// WHIP publish and WHEP read share the same path-based URL convention on
// MediaMTX's webrtc listener (POST http://host:8889/<path>/whip|whep,
// Content-Type: application/sdp) — proxied through nginx+TLS at
// MEDIAMTX_PUBLIC_URL, since browsers block a plain-http fetch() from an
// https page (mixed content).
export function buildWhipPublishUrl(path: string): string {
  return `${requireEnv("MEDIAMTX_PUBLIC_URL")}/${path}/whip`;
}

export function buildWhepPlaybackUrl(path: string): string {
  return `${requireEnv("MEDIAMTX_PUBLIC_URL")}/${path}/whep`;
}

// Fallback for streamers who'd rather use OBS/a mobile RTMP app than the
// in-browser WHIP publisher — rtmpAddress is already open on the VPS
// (used by nothing else, camera paths only publish there themselves), no
// nginx/TLS involved since RTMP isn't a browser fetch.
export function buildRtmpPublishUrl(path: string): string {
  return `rtmp://${requireEnv("MEDIAMTX_RTMP_HOST")}/${path}`;
}
