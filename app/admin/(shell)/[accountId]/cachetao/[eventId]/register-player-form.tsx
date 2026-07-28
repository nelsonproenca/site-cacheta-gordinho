"use client";

import { useActionState, useState } from "react";
import { adminRegisterPlayer, type ActionState } from "@/lib/actions/cachetao";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function RegisterPlayerForm({ eventId, accountId }: { eventId: string; accountId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(adminRegisterPlayer, null);
  const [formKey, setFormKey] = useState(0);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state && "success" in state) setFormKey((k) => k + 1);
  }

  return (
    <form key={formKey} action={formAction} className="flex flex-wrap items-end gap-4">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="tiktok_account_id" value={accountId} />
      <Field label="@tiktok" htmlFor="tiktok_handle" className="w-48">
        <Input id="tiktok_handle" name="tiktok_handle" type="text" required placeholder="usuario" />
      </Field>
      <Field label="Nome (se novo)" htmlFor="display_name" className="w-48">
        <Input id="display_name" name="display_name" type="text" placeholder="opcional" />
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        Inscrever
      </Button>
      {state && "error" in state && <p className="error-text w-full">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-green w-full">{state.success}</p>}
    </form>
  );
}
