"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncCachetaoEventStatus, registerPlayerForEvent } from "@/lib/cachetao";
import { normalizeHandle, saoPauloLocalToIso } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type ActionState = { error: string } | { success: string } | null;

export async function createCachetaoEvent(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tiktokAccountId = String(formData.get("tiktok_account_id") ?? "");
  const eventDate = String(formData.get("event_date") ?? "");
  const registrationOpensAt = String(formData.get("registration_opens_at") ?? "");
  const registrationClosesAt = String(formData.get("registration_closes_at") ?? "") || null;
  const maxPrincipals = String(formData.get("max_principals") ?? "") || null;
  const maxSubstitutes = String(formData.get("max_substitutes") ?? "") || null;
  const closeRule = String(formData.get("close_rule") ?? "");

  if (!tiktokAccountId || !eventDate || !registrationOpensAt || !["time", "count", "both"].includes(closeRule)) {
    return { error: "Preencha data do evento, abertura de inscrições e regra de encerramento." };
  }
  if ((closeRule === "time" || closeRule === "both") && !registrationClosesAt) {
    return { error: "Informe quando as inscrições fecham." };
  }
  if ((closeRule === "count" || closeRule === "both") && !maxPrincipals) {
    return { error: "Informe o número de vagas principais." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada, faça login novamente." };

  const { error } = await supabase.from("cachetao_events").insert({
    tiktok_account_id: tiktokAccountId,
    event_date: eventDate,
    // datetime-local inputs carry no offset — treated as São Paulo wall time.
    registration_opens_at: saoPauloLocalToIso(registrationOpensAt),
    registration_closes_at: registrationClosesAt ? saoPauloLocalToIso(registrationClosesAt) : null,
    max_principals: maxPrincipals ? Number(maxPrincipals) : null,
    max_substitutes: maxSubstitutes ? Number(maxSubstitutes) : null,
    close_rule: closeRule,
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath(`/admin/${tiktokAccountId}/cachetao`);
  return { success: "Cachetão criado." };
}

async function findOrCreatePlayer(
  supabase: SupabaseClient<Database>,
  displayName: string,
  handle: string,
): Promise<{ error: string } | { id: string }> {
  const { data: existing } = await supabase
    .from("players")
    .select("id")
    .eq("tiktok_handle", handle)
    .maybeSingle();
  if (existing) return { id: existing.id };

  if (!displayName) return { error: "Jogador novo — informe o nome também." };

  const { data: created, error } = await supabase
    .from("players")
    .insert({ display_name: displayName, tiktok_handle: handle })
    .select("id")
    .single();
  if (error || !created) return { error: error?.message ?? "Falha ao criar jogador." };
  return { id: created.id };
}

// Public self-registration — players have no auth (see CLAUDE.md), so this
// always runs on the service-role client, same reasoning as createPlayer in
// lib/actions/players.ts. The capacity/FIFO math is shared with
// adminRegisterPlayer via registerPlayerForEvent (lib/cachetao.ts).
export async function registerForCachetao(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const eventId = String(formData.get("event_id") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const tiktokHandle = normalizeHandle(String(formData.get("tiktok_handle") ?? ""));

  if (!eventId || !tiktokHandle) return { error: "Informe seu @tiktok." };

  const service = createServiceClient();

  const { data: event } = await service.from("cachetao_events").select("*").eq("id", eventId).maybeSingle();
  if (!event) return { error: "Cachetão não encontrado." };

  const synced = await syncCachetaoEventStatus(service, event);

  const player = await findOrCreatePlayer(service, displayName, tiktokHandle);
  if ("error" in player) return { error: player.error };

  const result = await registerPlayerForEvent(service, synced, player.id);
  if ("error" in result) return { error: result.error };

  revalidatePath(`/admin/${event.tiktok_account_id}/cachetao/${eventId}`);
  return result.data.registrationType === "principal"
    ? { success: "Inscrição confirmada! Você está entre os principais." }
    : { success: `Inscrição confirmada como suplente (posição ${result.data.queuePosition} na fila).` };
}

// Admin manual add during the week — reuses the same registerPlayerForEvent
// capacity/FIFO logic as self-registration, just entered by an admin. Auth
// and account access are checked explicitly here because the write itself
// runs on the service-role client: service role bypasses RLS entirely, so
// there's no policy backstopping this the way cachetao_registrations_write_admin
// backstops cancelRegistration/markNoShow below.
export async function adminRegisterPlayer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const eventId = String(formData.get("event_id") ?? "");
  const tiktokAccountId = String(formData.get("tiktok_account_id") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const tiktokHandle = normalizeHandle(String(formData.get("tiktok_handle") ?? ""));

  if (!eventId || !tiktokAccountId || !tiktokHandle) return { error: "Informe o @tiktok do jogador." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada, faça login novamente." };

  const { data: access } = await supabase
    .from("admin_account_access")
    .select("admin_id")
    .eq("admin_id", user.id)
    .eq("tiktok_account_id", tiktokAccountId)
    .maybeSingle();
  if (!access) return { error: "Sem acesso a esta conta." };

  const service = createServiceClient();
  const { data: event } = await service.from("cachetao_events").select("*").eq("id", eventId).maybeSingle();
  if (!event || event.tiktok_account_id !== tiktokAccountId) return { error: "Cachetão não encontrado." };

  const synced = await syncCachetaoEventStatus(service, event);

  const player = await findOrCreatePlayer(service, displayName, tiktokHandle);
  if ("error" in player) return { error: player.error };

  const result = await registerPlayerForEvent(service, synced, player.id);
  if ("error" in result) return { error: result.error };

  revalidatePath(`/admin/${tiktokAccountId}/cachetao/${eventId}`);
  return {
    success: `@${tiktokHandle} inscrito como ${result.data.registrationType === "principal" ? "principal" : "suplente"}.`,
  };
}

// Presence/cancellation updates go through the regular per-request client —
// unlike the capacity-aware insert above, admin already has direct RLS write
// access (cachetao_registrations_write_admin) for single-row status changes,
// so there's no need for the service-role client here.
export async function cancelRegistration(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const eventId = String(formData.get("event_id") ?? "");
  const tiktokAccountId = String(formData.get("tiktok_account_id") ?? "");

  const supabase = await createClient();

  const { data: cancelled } = await supabase
    .from("cachetao_registrations")
    .update({ status: "cancelled" })
    .eq("id", id)
    .select("registration_type")
    .single();

  // Freed a principal slot — promote the first substitute still in the
  // queue (FIFO by queue_position) into it.
  if (cancelled?.registration_type === "principal") {
    const { data: nextInLine } = await supabase
      .from("cachetao_registrations")
      .select("id")
      .eq("cachetao_event_id", eventId)
      .eq("registration_type", "substitute")
      .neq("status", "cancelled")
      .order("queue_position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextInLine) {
      await supabase
        .from("cachetao_registrations")
        .update({ registration_type: "principal", queue_position: null, status: "called_up" })
        .eq("id", nextInLine.id);
    }
  }

  revalidatePath(`/admin/${tiktokAccountId}/cachetao/${eventId}`);
}

export async function markNoShow(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const eventId = String(formData.get("event_id") ?? "");
  const tiktokAccountId = String(formData.get("tiktok_account_id") ?? "");

  const supabase = await createClient();
  await supabase.from("cachetao_registrations").update({ status: "no_show" }).eq("id", id);

  revalidatePath(`/admin/${tiktokAccountId}/cachetao/${eventId}`);
}

// Manual stage transitions on event day — nothing auto-detects "the live
// broadcast actually started", so an admin flips these directly, same as
// closeLiveSession.
export async function startCachetaoEvent(formData: FormData) {
  const eventId = String(formData.get("event_id") ?? "");
  const tiktokAccountId = String(formData.get("tiktok_account_id") ?? "");

  const supabase = await createClient();
  await supabase.from("cachetao_events").update({ status: "in_progress" }).eq("id", eventId);

  revalidatePath(`/admin/${tiktokAccountId}/cachetao/${eventId}`);
}

export async function finishCachetaoEvent(formData: FormData) {
  const eventId = String(formData.get("event_id") ?? "");
  const tiktokAccountId = String(formData.get("tiktok_account_id") ?? "");

  const supabase = await createClient();
  await supabase.from("cachetao_events").update({ status: "finished" }).eq("id", eventId);

  revalidatePath(`/admin/${tiktokAccountId}/cachetao/${eventId}`);
}
