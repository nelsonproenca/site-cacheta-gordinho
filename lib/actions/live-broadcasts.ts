"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { closeStaleLiveSessions } from "@/lib/live-sessions";

// Only used by the broadcast flow. openLiveSession (lib/actions/lives.ts,
// the existing "Lives" tab) always inserts a new live_sessions row and is
// deliberately left untouched — but starting an in-app transmission reuses
// the account's already-open session if there is one, so "the live" stays a
// single concept for the streamer (prd.md §4.14 decision: linked, not a
// parallel concept).
export async function getOrCreateOpenLiveSession(
  supabase: SupabaseClient<Database>,
  accountId: string,
  adminId: string,
): Promise<string> {
  await closeStaleLiveSessions(supabase, accountId);

  const { data: openSession } = await supabase
    .from("live_sessions")
    .select("id")
    .eq("tiktok_account_id", accountId)
    .eq("status", "open")
    .maybeSingle();

  if (openSession) return openSession.id;

  const { data: openPeriod } = await supabase
    .from("score_periods")
    .select("id")
    .eq("tiktok_account_id", accountId)
    .eq("status", "open")
    .maybeSingle();

  const { data, error } = await supabase
    .from("live_sessions")
    .insert({
      tiktok_account_id: accountId,
      session_date: new Date().toISOString(),
      score_period_id: openPeriod?.id ?? null,
      created_by: adminId,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Falha ao abrir live");
  return data.id;
}

export async function startBroadcast(formData: FormData) {
  const accountId = String(formData.get("account_id") ?? "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const liveSessionId = await getOrCreateOpenLiveSession(supabase, accountId, user.id);

  const { data, error } = await supabase
    .from("live_broadcasts")
    .insert({ tiktok_account_id: accountId, live_session_id: liveSessionId, started_by: user.id })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Falha ao criar transmissão");

  redirect(`/admin/${accountId}/live/${data.id}`);
}

// live_broadcasts has no update RLS policy at all (20260801000037) — status/
// ended_at only ever change via the SRS callbacks or here, both through
// createServiceClient(). The RLS-gated select below is what actually
// authorizes the caller (has_account_access), same defense-in-depth shape as
// the "Excluir" action in lib/actions/admin-approvals.ts: confirm access on
// the regular per-request client first, only then use the service client to
// bypass RLS for the write itself.
export async function endBroadcastManually(formData: FormData) {
  const broadcastId = String(formData.get("broadcast_id") ?? "");
  const accountId = String(formData.get("account_id") ?? "");

  const supabase = await createClient();
  const { data: broadcast } = await supabase
    .from("live_broadcasts")
    .select("id, status")
    .eq("id", broadcastId)
    .maybeSingle();

  if (!broadcast) throw new Error("Transmissão não encontrada ou sem acesso.");

  if (broadcast.status !== "ended") {
    const service = createServiceClient();
    await service
      .from("live_broadcasts")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", broadcastId);
  }

  revalidatePath(`/admin/${accountId}/live/${broadcastId}`);
}
