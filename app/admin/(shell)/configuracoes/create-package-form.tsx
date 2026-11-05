"use client";

import { useActionState } from "react";
import { createCoinPackage, type ActionState } from "@/lib/actions/coin-packages";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function CreatePackageForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCoinPackage, null);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-4">
      <Field label="Nome" htmlFor="name" className="w-48">
        <Input id="name" name="name" type="text" required placeholder="Ex: Pacote Mega" />
      </Field>
      <Field label="Preço (R$)" htmlFor="price_brl" className="w-32">
        <Input id="price_brl" name="price_brl" type="number" step="0.01" min={0.01} required />
      </Field>
      <Field label="Moedas" htmlFor="coin_amount" className="w-32">
        <Input id="coin_amount" name="coin_amount" type="number" step="1" min={1} required />
      </Field>
      <Field label="Ordem" htmlFor="sort_order" className="w-24">
        <Input id="sort_order" name="sort_order" type="number" step="1" defaultValue={0} />
      </Field>
      <Button type="submit" disabled={pending}>
        Adicionar
      </Button>
      {state && "error" in state && <p className="error-text w-full">{state.error}</p>}
    </form>
  );
}
