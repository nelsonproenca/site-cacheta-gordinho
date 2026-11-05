"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AdminWalletActionState = { error: string } | { success: string } | null;

export async function reviewCoinPurchase(
  _prevState: AdminWalletActionState,
  formData: FormData,
): Promise<AdminWalletActionState> {
  const orderId = String(formData.get("order_id") ?? "");
  const approve = String(formData.get("approve") ?? "") === "true";
  const rejectionReason = String(formData.get("rejection_reason") ?? "").trim() || undefined;

  if (!orderId) return { error: "Pedido inválido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_coin_purchase", {
    p_order_id: orderId,
    p_approve: approve,
    p_rejection_reason: rejectionReason,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/pagamentos");
  return { success: approve ? "Pedido aprovado — moedas creditadas." : "Pedido rejeitado." };
}
