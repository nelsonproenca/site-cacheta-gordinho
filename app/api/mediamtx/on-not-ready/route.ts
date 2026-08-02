import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Mirrors on-ready/route.ts for MediaMTX's `runOnNotReady` hook (v1.9.3
// naming, see on-ready/route.ts) — fires when the publisher stops
// (disconnects, ends the WHIP session, or the RTMP/OBS connection drops).
export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (!process.env.MEDIAMTX_CALLBACK_SECRET || secret !== process.env.MEDIAMTX_CALLBACK_SECRET) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get("path");
  const streamKey = path?.startsWith("live_") ? path.slice("live_".length) : null;
  if (!streamKey) {
    return NextResponse.json({ ok: true });
  }

  const service = createServiceClient();
  await service
    .from("live_broadcasts")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("stream_key", streamKey)
    .neq("status", "ended");

  return NextResponse.json({ ok: true });
}
