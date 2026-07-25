"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string } | { success: string } | null;

// scoring_rules is global (20260725000028) — tiktokAccountId below is only
// ever used for revalidatePath (the "Pontuação" page still lives under
// /admin/[accountId]/pontuacao even though its data isn't account-scoped
// anymore), never to scope a query or write. RLS (scoring_rules_write_super_admin)
// is what actually restricts these four actions to the super admin.
export async function createScoringRule(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tiktokAccountId = String(formData.get("tiktok_account_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const points = Number(formData.get("points"));

  if (!tiktokAccountId || !name || Number.isNaN(points)) {
    return { error: "Preencha nome e pontos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("scoring_rules").insert({ name, points });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/${tiktokAccountId}/pontuacao`);
  return { success: "Regra criada." };
}

export async function toggleScoringRule(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const tiktokAccountId = String(formData.get("tiktok_account_id") ?? "");
  const isActive = formData.get("is_active") === "true";

  const supabase = await createClient();
  await supabase.from("scoring_rules").update({ is_active: !isActive }).eq("id", id);

  revalidatePath(`/admin/${tiktokAccountId}/pontuacao`);
}

export async function updateScoringRule(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const tiktokAccountId = String(formData.get("tiktok_account_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const points = Number(formData.get("points"));

  if (!id || !tiktokAccountId || !name || Number.isNaN(points)) {
    return { error: "Preencha nome e pontos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("scoring_rules").update({ name, points }).eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/${tiktokAccountId}/pontuacao`);
  return { success: "Regra atualizada." };
}

export async function deleteScoringRule(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const tiktokAccountId = String(formData.get("tiktok_account_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("scoring_rules").delete().eq("id", id);

  if (error) {
    const message =
      error.code === "23503"
        ? "Não é possível excluir: essa regra já foi usada em resultados. Desative-a em vez disso."
        : error.message;
    return { error: message };
  }

  revalidatePath(`/admin/${tiktokAccountId}/pontuacao`);
  return { success: "Regra excluída." };
}
