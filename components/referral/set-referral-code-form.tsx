"use client";

import { useActionState } from "react";
import { setReferralCode, type ReferralActionState } from "@/lib/actions/referral";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function SetReferralCodeForm() {
  const [state, formAction, pending] = useActionState<ReferralActionState, FormData>(setReferralCode, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="Escolha seu código" htmlFor="code" hint="Não pode ser alterado depois">
        <Input id="code" name="code" type="text" required placeholder="Ex: NELSON10" maxLength={20} />
      </Field>
      {state && "error" in state && <p className="error-text text-sm">{state.error}</p>}
      <Button type="submit" variant="yellow" disabled={pending} className="self-start">
        Ativar meu código
      </Button>
    </form>
  );
}
