"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeHandle } from "@/lib/utils";

export type ActionState = { error: string } | { success: string } | null;

export async function createTiktokAccount(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const handle = normalizeHandle(String(formData.get("handle") ?? ""));
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!handle || !displayName) {
    return { error: "Preencha @tiktok e nome de exibição." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_tiktok_account", {
    p_handle: handle,
    p_display_name: displayName,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/contas");
  return { success: `Conta @${handle} criada.` };
}

export async function addModerator(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tiktokAccountId = String(formData.get("tiktok_account_id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!tiktokAccountId || !email) {
    return { error: "Informe o e-mail do moderador." };
  }

  const supabase = await createClient();

  const { data: admin, error: adminError } = await supabase
    .from("admins")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (adminError) {
    return { error: adminError.message };
  }

  if (!admin) {
    return { error: "Nenhum admin com esse e-mail. Peça para a pessoa criar login primeiro em /admin/login." };
  }

  const { error } = await supabase
    .from("admin_account_access")
    .insert({ admin_id: admin.id, tiktok_account_id: tiktokAccountId, role: "moderator" });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/contas");
  return { success: "Moderador adicionado." };
}

export async function deleteTiktokAccount(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tiktokAccountId = String(formData.get("tiktok_account_id") ?? "");
  const handleConfirmation = normalizeHandle(String(formData.get("handle_confirmation") ?? ""));

  if (!tiktokAccountId || !handleConfirmation) {
    return { error: "Digite o @tiktok da conta para confirmar." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_tiktok_account", {
    p_account_id: tiktokAccountId,
    p_handle_confirmation: handleConfirmation,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/contas");
  return { success: "Conta excluída." };
}
