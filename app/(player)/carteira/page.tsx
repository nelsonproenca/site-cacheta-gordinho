import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card as UiCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PurchasePackageModalLauncher } from "@/components/wallet/purchase-package-modal";

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando aprovação",
  approved: "Aprovado",
  rejected: "Rejeitado",
};

const ORDER_STATUS_VARIANT: Record<string, "yellow" | "green" | "red"> = {
  pending: "yellow",
  approved: "green",
  rejected: "red",
};

// specs/002-moedas-pagamento-indicacao, US1 — saldo (sempre derivado de
// wallet_movements, nunca uma coluna cacheada, ver research.md §1), pacotes
// ativos, e histórico de pedidos do próprio jogador. Convidado nunca chega
// aqui (middleware redireciona, lib/supabase/middleware.ts).
export default async function CarteiraPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar?next=/carteira");

  const { data: myPlayerId } = await supabase.rpc("current_player_id");
  if (!myPlayerId) redirect("/entrar?next=/carteira");

  const [{ data: movements }, { data: packages }, { data: orders }, { data: settings }] = await Promise.all([
    supabase.from("wallet_movements").select("amount").eq("player_id", myPlayerId),
    supabase.from("coin_packages").select("id, name, price_brl, coin_amount").eq("active", true).order("sort_order"),
    supabase
      .from("coin_purchase_orders")
      .select("id, coin_amount, price_brl, status, rejection_reason, created_at")
      .eq("player_id", myPlayerId)
      .order("created_at", { ascending: false }),
    supabase.from("platform_settings").select("pix_key, pix_key_owner_name").single(),
  ]);

  const balance = (movements ?? []).reduce((sum, m) => sum + m.amount, 0);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8 max-w-2xl mx-auto w-full">
      <div>
        <p className="caption">Cacheta Gordinho</p>
        <h1 className="font-display text-2xl italic font-extrabold uppercase">Carteira</h1>
      </div>

      <UiCard className="flex flex-col items-center gap-1 py-8">
        <span className="text-ink-dim text-sm">Saldo atual</span>
        <span className="font-display text-4xl font-extrabold">{balance} moedas</span>
      </UiCard>

      <UiCard className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-bold uppercase">Comprar moedas</h2>
        {(packages ?? []).length === 0 ? (
          <p className="text-ink-dim text-sm">Nenhum pacote disponível no momento.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {(packages ?? []).map((pkg) => (
              <PurchasePackageModalLauncher
                key={pkg.id}
                packageId={pkg.id}
                name={pkg.name}
                priceBrl={pkg.price_brl}
                coinAmount={pkg.coin_amount}
                pixKey={settings?.pix_key ?? null}
                pixKeyOwnerName={settings?.pix_key_owner_name ?? null}
              />
            ))}
          </div>
        )}
      </UiCard>

      <UiCard className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold uppercase">Histórico de pedidos</h2>
        {(orders ?? []).length === 0 ? (
          <p className="text-ink-dim text-sm">Nenhum pedido ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(orders ?? []).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {o.coin_amount} moedas — R$ {Number(o.price_brl).toFixed(2)}
                  {o.status === "rejected" && o.rejection_reason ? ` (${o.rejection_reason})` : ""}
                </span>
                <Badge variant={ORDER_STATUS_VARIANT[o.status] ?? "neutral"}>
                  {ORDER_STATUS_LABEL[o.status] ?? o.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </UiCard>
    </main>
  );
}
