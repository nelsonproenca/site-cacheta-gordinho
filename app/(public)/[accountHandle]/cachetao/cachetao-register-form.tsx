"use client";

import { useActionState, useState } from "react";
import { registerForCachetao, type ActionState } from "@/lib/actions/cachetao";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function CachetaoRegisterForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(registerForCachetao, null);
  const [formKey, setFormKey] = useState(0);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state && "success" in state) setFormKey((k) => k + 1);
  }

  return (
    <form key={formKey} action={formAction} className="flex flex-wrap items-end gap-4">
      <input type="hidden" name="event_id" value={eventId} />
      <Field label="@tiktok" htmlFor="tiktok_handle" className="flex-1 min-w-[160px]">
        <Input id="tiktok_handle" name="tiktok_handle" type="text" required placeholder="usuario" />
      </Field>
      <Field label="Nome (se ainda não cadastrado)" htmlFor="display_name" className="flex-1 min-w-[160px]">
        <Input id="display_name" name="display_name" type="text" placeholder="opcional" />
      </Field>
      <Button type="submit" disabled={pending}>
        Inscrever-se
      </Button>
      {state && "error" in state && <p className="error-text w-full">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-green w-full">{state.success}</p>}
    </form>
  );
}
