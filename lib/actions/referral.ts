"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ReferralActionState = { error: string } | { success: string } | null;

export async function setReferralCode(
  _prevState: ReferralActionState,
  formData: FormData,
): Promise<ReferralActionState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Informe um código." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_referral_code", { p_code: code });
  if (error) return { error: error.message };

  revalidatePath("/indicacao");
  return { success: "Código definido!" };
}
