import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// MediaMTX's `runOnReady` path-level hook (mediamtx.yml, `~^live_(.+)$`) —
// fires a shell command (`curl -s -X POST ".../on-ready?secret=...&path=$MTX_PATH"`)
// once the stream is ready to be read, i.e. right after a publish starts.
// Naming note: MediaMTX v1.9.3 (the version actually running on the VPS —
// confirmed after `runOnAvailable`/`runOnUnavailable`, names from a newer
// MediaMTX release, failed with "unknown field" on this install) calls
// these hooks runOnReady/runOnNotReady; this route is named to match. There's
// no JSON body (MediaMTX runs a command, it doesn't POST a payload) and no
// "reject" response MediaMTX would honor — this is bookkeeping only. Real
// access control is the path itself being derived from a random stream_key
// that a player only learns once already live (20260801000040), plus
// MediaMTX only ever accepting one publisher per path.
export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (!process.env.MEDIAMTX_CALLBACK_SECRET || secret !== process.env.MEDIAMTX_CALLBACK_SECRET) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get("path");
  const streamKey = path?.startsWith("live_") ? path.slice("live_".length) : null;
  if (!streamKey) {
    return NextResponse.json({ error: "missing or unrecognized path" }, { status: 400 });
  }

  const service = createServiceClient();
  await service
    .from("live_broadcasts")
    .update({ status: "live", started_at: new Date().toISOString() })
    .eq("stream_key", streamKey)
    .neq("status", "live");

  return NextResponse.json({ ok: true });
}
