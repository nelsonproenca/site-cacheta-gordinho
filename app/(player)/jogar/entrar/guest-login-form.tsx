"use client";

import { useActionState } from "react";
import { enterAsGuest, type PlayerAuthState } from "@/lib/actions/player-auth";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function GuestLoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<PlayerAuthState, FormData>(enterAsGuest, null);

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <Field label="Seu nome" htmlFor="display_name" hint="É assim que você vai aparecer na mesa">
        <Input id="display_name" name="display_name" type="text" required placeholder="Seu nome" autoFocus />
      </Field>
      {state && "error" in state && <p className="error-text">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Entrando..." : "Jogar"}
      </Button>
    </form>
  );
}
