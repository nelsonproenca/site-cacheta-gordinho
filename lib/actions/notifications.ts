"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string } | { success: string } | null;

// Sent from cross-streamer-section.tsx's "Iniciar partida" button — no link
// or match reference yet, just a plain heads-up (see notifications,
// 20260724000026). recipient must actually be an approved streamer, same
// defense-in-depth reasoning as every other cross-admin write in this app.
export async function notifyStreamer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const recipientAdminId = String(formData.get("recipient_admin_id") ?? "");
  if (!recipientAdminId) return { error: "Selecione um streamer." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada, faça login novamente." };

  const { data: me } = await supabase.from("admins").select("name").eq("id", user.id).single();

  const { data: recipient } = await supabase
    .from("admins")
    .select("id")
    .eq("id", recipientAdminId)
    .eq("user_type", "streamer")
    .eq("status", "approved")
    .maybeSingle();
  if (!recipient) return { error: "Streamer não encontrado." };

  const { error } = await supabase.from("notifications").insert({
    recipient_admin_id: recipientAdminId,
    sender_admin_id: user.id,
    message: `${me?.name ?? "Alguém"} quer iniciar uma partida com você.`,
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: "Notificação enviada." };
}

export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("recipient_admin_id", user.id)
    .eq("is_read", false);

  revalidatePath("/", "layout");
}
