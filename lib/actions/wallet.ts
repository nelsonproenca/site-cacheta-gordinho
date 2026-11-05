"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type WalletActionState = { error: string } | { success: string } | null;

// Sobe o comprovante direto pelo cliente por-requisição do próprio jogador
// (RLS de storage.objects, não service-role — o path só é aceito se
// prefixado pelo current_player_id() dele, 20261105000052), depois chama a
// RPC que grava o pedido (status 'pending'). Confirmação é sempre manual por
// um admin (review_coin_purchase) — sem integração de PSP/banco nesta fase.
export async function requestCoinPurchase(
  _prevState: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  const packageId = String(formData.get("package_id") ?? "");
  const receipt = formData.get("receipt") as File | null;

  if (!packageId) return { error: "Selecione um pacote." };
  if (!receipt || receipt.size === 0) return { error: "Anexe o comprovante do Pix." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Faça login para comprar moedas." };

  const { data: myPlayerId } = await supabase.rpc("current_player_id");
  if (!myPlayerId) return { error: "Faça login para comprar moedas." };

  const ext = receipt.name.split(".").pop() || "bin";
  const path = `${myPlayerId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("payment-receipts").upload(path, receipt, {
    contentType: receipt.type || "application/octet-stream",
  });
  if (uploadError) return { error: `Falha ao enviar o comprovante: ${uploadError.message}` };

  const { error: rpcError } = await supabase.rpc("request_coin_purchase", {
    p_package_id: packageId,
    p_receipt_path: path,
  });
  if (rpcError) return { error: rpcError.message };

  revalidatePath("/carteira");
  return { success: "Pedido enviado! Aguarde a aprovação de um admin." };
}
