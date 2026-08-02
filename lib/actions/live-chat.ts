"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Message sending itself goes straight from the client to the
// send_live_chat_message RPC (components/broadcast/live-chat.tsx) — a chat
// send shouldn't pay for a full Server Action + revalidatePath round trip,
// and the RPC already enforces every rule server-side regardless of who
// calls it. These three are moderation-only, reached from the admin's
// broadcast detail page.

export async function deleteChatMessage(formData: FormData) {
  const messageId = String(formData.get("message_id") ?? "");
  const returnPath = String(formData.get("return_path") ?? "");

  const supabase = await createClient();
  await supabase.from("live_chat_messages").update({ deleted_at: new Date().toISOString() }).eq("id", messageId);

  if (returnPath) revalidatePath(returnPath);
}

export async function muteChatPlayer(formData: FormData) {
  const broadcastId = String(formData.get("broadcast_id") ?? "");
  const playerId = String(formData.get("player_id") ?? "");
  const returnPath = String(formData.get("return_path") ?? "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("live_chat_mutes")
    .insert({ live_broadcast_id: broadcastId, player_id: playerId, muted_by: user.id });

  if (returnPath) revalidatePath(returnPath);
}

export async function unmuteChatPlayer(formData: FormData) {
  const broadcastId = String(formData.get("broadcast_id") ?? "");
  const playerId = String(formData.get("player_id") ?? "");
  const returnPath = String(formData.get("return_path") ?? "");

  const supabase = await createClient();
  await supabase.from("live_chat_mutes").delete().eq("live_broadcast_id", broadcastId).eq("player_id", playerId);

  if (returnPath) revalidatePath(returnPath);
}
