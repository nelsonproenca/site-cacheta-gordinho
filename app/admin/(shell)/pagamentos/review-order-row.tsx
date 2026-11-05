"use client";

import { useActionState, useState } from "react";
import { reviewCoinPurchase, type AdminWalletActionState } from "@/lib/actions/admin-wallet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ReviewOrderRow({
  orderId,
  playerName,
  playerHandle,
  coinAmount,
  priceBrl,
  receiptUrl,
  createdAt,
}: {
  orderId: string;
  playerName: string;
  playerHandle: string;
  coinAmount: number;
  priceBrl: number;
  receiptUrl: string | null;
  createdAt: string;
}) {
  const [state, formAction, pending] = useActionState<AdminWalletActionState, FormData>(reviewCoinPurchase, null);
  const [showReject, setShowReject] = useState(false);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-bold">
            {playerName} <span className="text-ink-dim mono-data">@{playerHandle}</span>
          </p>
          <p className="text-ink-dim text-sm">
            {coinAmount} moedas — R$ {priceBrl.toFixed(2)} — {new Date(createdAt).toLocaleString("pt-BR")}
          </p>
        </div>
        {receiptUrl && (
          <a href={receiptUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
            Ver comprovante
          </a>
        )}
      </div>

      {state && "error" in state && <p className="error-text text-sm">{state.error}</p>}

      {!showReject ? (
        <div className="flex gap-2">
          <form action={formAction}>
            <input type="hidden" name="order_id" value={orderId} />
            <input type="hidden" name="approve" value="true" />
            <Button type="submit" variant="yellow" size="sm" disabled={pending}>
              Aprovar
            </Button>
          </form>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowReject(true)} disabled={pending}>
            Rejeitar
          </Button>
        </div>
      ) : (
        <form action={formAction} className="flex gap-2 items-center">
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="approve" value="false" />
          <input name="rejection_reason" placeholder="Motivo (opcional)" className="input flex-1" />
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            Confirmar rejeição
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowReject(false)}>
            Cancelar
          </Button>
        </form>
      )}
    </Card>
  );
}
