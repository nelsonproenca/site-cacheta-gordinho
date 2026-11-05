"use client";

import { useActionState } from "react";
import { enterAsGuest, type PlayerAuthState } from "@/lib/actions/player-auth";
import { createClient } from "@/lib/supabase/client";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function GuestLoginForm({ next, referralCode }: { next: string; referralCode: string | null }) {
  const [state, action, pending] = useActionState<PlayerAuthState, FormData>(enterAsGuest, null);

  // specs/002-moedas-pagamento-indicacao, US4 — "Continuar com Google" é uma
  // conta identificada (ao contrário do fluxo de convidado abaixo), por isso
  // vai para app/auth/callback/route.ts em vez de enterAsGuest/
  // signInAnonymously. redirectTo aponta pro callback com `next` (e `ref`,
  // se vier da própria /jogar/entrar) preservados como query params.
  async function continueWithGoogle() {
    const supabase = createClient();
    const callbackNext = encodeURIComponent(next);
    const refParam = referralCode ? `&ref=${encodeURIComponent(referralCode)}` : "";
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${callbackNext}${refParam}`,
      },
    });
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <button type="button" onClick={continueWithGoogle} className="btn btn-outline w-full">
        Continuar com Google
      </button>

      <div className="flex items-center gap-3 text-ink-dim text-xs">
        <span className="flex-1 border-t border-stroke" /> ou <span className="flex-1 border-t border-stroke" />
      </div>

      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="next" value={next} />
        <Field label="Seu nome" htmlFor="display_name" hint="É assim que você vai aparecer na mesa">
          <Input id="display_name" name="display_name" type="text" required placeholder="Seu nome" autoFocus />
        </Field>
        {state && "error" in state && <p className="error-text">{state.error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Entrando..." : "Jogar sem conta"}
        </Button>
      </form>
    </div>
  );
}
