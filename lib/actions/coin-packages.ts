"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string } | { success: string } | null;

// coin_packages_write_super_admin (20261105000051) is what actually
// restricts these — mesmo padrão de lib/actions/scoring-rules.ts.
export async function createCoinPackage(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const priceBrl = Number(formData.get("price_brl"));
  const coinAmount = Number(formData.get("coin_amount"));
  const sortOrder = Number(formData.get("sort_order") ?? 0);

  if (!name || Number.isNaN(priceBrl) || Number.isNaN(coinAmount)) {
    return { error: "Preencha nome, preço e quantidade de moedas." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("coin_packages")
    .insert({ name, price_brl: priceBrl, coin_amount: coinAmount, sort_order: sortOrder });
  if (error) return { error: error.message };

  revalidatePath("/admin/configuracoes");
  return { success: "Pacote criado." };
}

export async function toggleCoinPackage(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const isActive = formData.get("active") === "true";

  const supabase = await createClient();
  await supabase.from("coin_packages").update({ active: !isActive }).eq("id", id);

  revalidatePath("/admin/configuracoes");
}

export async function deleteCoinPackage(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("coin_packages").delete().eq("id", id);
  if (error) {
    const message =
      error.code === "23503"
        ? "Não é possível excluir: esse pacote já foi usado em pedidos. Desative-o em vez disso."
        : error.message;
    return { error: message };
  }

  revalidatePath("/admin/configuracoes");
  return { success: "Pacote excluído." };
}
