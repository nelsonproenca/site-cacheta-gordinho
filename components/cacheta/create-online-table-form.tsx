"use client";

import { useActionState } from "react";
import { createOnlineTable } from "@/lib/actions/cacheta";
import type { ActionState } from "@/lib/actions/cacheta";
import { Button } from "@/components/ui/button";

// specs/002-moedas-pagamento-indicacao, US2 — valor de entrada opcional;
// zero (padrão) preserva o comportamento gratuito já existente sem nenhuma
// mudança de fluxo para quem não quer apostar moedas.
export function CreateOnlineTableForm({ allowPaid, balance }: { allowPaid: boolean; balance: number | null }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createOnlineTable, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {allowPaid && (
        <label className="flex flex-col gap-1 text-sm">
          Valor de entrada (moedas, opcional — deixe 0 para mesa gratuita)
          <input type="number" name="entry_amount" min={0} step={1} defaultValue={0} className="input" />
        </label>
      )}
      {balance !== null && <p className="text-ink-dim text-xs">Seu saldo: {balance} moedas</p>}
      <Button type="submit" variant="yellow" disabled={pending} className="self-start">
        Criar nova mesa online
      </Button>
      {state && "error" in state && <p className="error-text text-sm">{state.error}</p>}
    </form>
  );
}
