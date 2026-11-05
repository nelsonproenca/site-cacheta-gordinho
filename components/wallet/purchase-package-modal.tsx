"use client";

import { useActionState, useState } from "react";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { requestCoinPurchase, type WalletActionState } from "@/lib/actions/wallet";

export function PurchasePackageModalLauncher({
  packageId,
  name,
  priceBrl,
  coinAmount,
  pixKey,
  pixKeyOwnerName,
}: {
  packageId: string;
  name: string;
  priceBrl: number;
  coinAmount: number;
  pixKey: string | null;
  pixKeyOwnerName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<WalletActionState, FormData>(requestCoinPurchase, null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-stroke bg-surface p-3 text-left hover:border-[var(--yellow)] transition-colors"
      >
        <span>
          <span className="font-bold">{name}</span>
          <span className="text-ink-dim text-sm block">{coinAmount} moedas</span>
        </span>
        <span className="font-display font-bold">R$ {Number(priceBrl).toFixed(2)}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalHeader title={`Comprar ${name}`} onClose={() => setOpen(false)} />
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Pague <strong>R$ {Number(priceBrl).toFixed(2)}</strong> via Pix e anexe o comprovante abaixo —
            um admin confirma manualmente e credita as <strong>{coinAmount} moedas</strong> na sua
            carteira.
          </p>
          {pixKey ? (
            <div className="rounded-[var(--radius-md)] border border-stroke bg-surface p-3 text-sm">
              <p className="text-ink-dim">Chave Pix{pixKeyOwnerName ? ` (${pixKeyOwnerName})` : ""}:</p>
              <p className="mono-data font-bold">{pixKey}</p>
            </div>
          ) : (
            <p className="error-text text-sm">Chave Pix ainda não configurada — fale com um admin.</p>
          )}

          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="package_id" value={packageId} />
            <label className="flex flex-col gap-1 text-sm">
              Comprovante do Pix (imagem ou PDF)
              <input type="file" name="receipt" accept="image/*,.pdf" required className="input" />
            </label>
            {state && "error" in state && <p className="error-text text-sm">{state.error}</p>}
            {state && "success" in state && <p className="text-sm text-[var(--green)]">{state.success}</p>}
            <Button type="submit" variant="yellow" disabled={pending || !pixKey}>
              {pending ? "Enviando..." : "Enviar comprovante"}
            </Button>
          </form>
        </div>
      </Modal>
    </>
  );
}
