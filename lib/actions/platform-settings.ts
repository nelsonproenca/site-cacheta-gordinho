"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string } | { success: string } | null;

// platform_settings_write_super_admin (20261105000053) is what actually
// restricts this — linha única (id = true), sempre um update, nunca insert.
export async function updatePlatformSettings(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const houseRakePercent = Number(formData.get("house_rake_percent"));
  const referralCommissionPercent = Number(formData.get("referral_commission_percent"));
  const pixKey = String(formData.get("pix_key") ?? "").trim() || null;
  const pixKeyOwnerName = String(formData.get("pix_key_owner_name") ?? "").trim() || null;

  if (Number.isNaN(houseRakePercent) || Number.isNaN(referralCommissionPercent)) {
    return { error: "Preencha os percentuais." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({
      house_rake_percent: houseRakePercent,
      referral_commission_percent: referralCommissionPercent,
      pix_key: pixKey,
      pix_key_owner_name: pixKeyOwnerName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) return { error: error.message };

  revalidatePath("/admin/configuracoes");
  revalidatePath("/carteira");
  return { success: "Configurações salvas." };
}
