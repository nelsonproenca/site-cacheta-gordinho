"use client";

import { useActionState } from "react";
import { linkPlayerByGoogle, type PlayerAuthState } from "@/lib/actions/player-auth";
import { NickAvailabilityInput } from "@/components/ui/nick-availability-input";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function LinkGoogleForm({ next, referralCode }: { next: string; referralCode: string | null }) {
  const [state, action, pending] = useActionState<PlayerAuthState, FormData>(linkPlayerByGoogle, null);

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      {referralCode && <input type="hidden" name="ref" value={referralCode} />}
      <NickAvailabilityInput name="tiktok_handle" />
      <Field label="Seu nome" htmlFor="display_name">
        <Input id="display_name" name="display_name" type="text" required placeholder="Seu nome" />
      </Field>
      {state && "error" in state && <p className="error-text">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Entrando..." : "Continuar"}
      </Button>
    </form>
  );
}
