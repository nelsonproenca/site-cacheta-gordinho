"use client";

import { useActionState } from "react";
import { createScoringRule, type ActionState } from "@/lib/actions/scoring-rules";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function CreateRuleForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createScoringRule, null);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-4">
      <Field label="Nome do resultado" htmlFor="name" className="w-80">
        <Input id="name" name="name" type="text" required placeholder="Ex: Vitória especial" />
      </Field>
      <Field label="Pontos" htmlFor="points" className="w-60">
        <Input id="points" name="points" type="number" required step="1" />
      </Field>
      <Button type="submit" disabled={pending}>
        Adicionar
      </Button>
      {state && "error" in state && <p className="error-text w-full">{state.error}</p>}
    </form>
  );
}
