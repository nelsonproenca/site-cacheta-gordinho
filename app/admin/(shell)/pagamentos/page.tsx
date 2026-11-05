import { createClient } from "@/lib/supabase/server";
import { ReviewOrderRow } from "./review-order-row";

export default async function PagamentosPage() {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("coin_purchase_orders")
    .select("id, coin_amount, price_brl, receipt_path, created_at, players(display_name, tiktok_handle)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const rows = await Promise.all(
    (orders ?? []).map(async (o) => {
      const { data: signed } = await supabase.storage.from("payment-receipts").createSignedUrl(o.receipt_path, 300);
      return { ...o, receiptUrl: signed?.signedUrl ?? null };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Pagamentos</h1>
        <p className="text-ink-dim">Pedidos de compra de moedas aguardando aprovação manual.</p>
      </div>

      <div className="flex flex-col gap-3">
        {rows.length === 0 && <p className="text-ink-dim">Nenhum pedido pendente.</p>}
        {rows.map((o) => (
          <ReviewOrderRow
            key={o.id}
            orderId={o.id}
            playerName={o.players?.display_name ?? "—"}
            playerHandle={o.players?.tiktok_handle ?? "—"}
            coinAmount={o.coin_amount}
            priceBrl={Number(o.price_brl)}
            receiptUrl={o.receiptUrl}
            createdAt={o.created_at}
          />
        ))}
      </div>
    </div>
  );
}
