"use client";

import { useActionState, useState } from "react";
import { requestPlayerOtp, verifyPlayerOtp, type PlayerAuthState } from "@/lib/actions/player-auth";
import { Field, Input, PhoneInput } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function PlayerLoginForm({ next }: { next: string }) {
  // Step is derived from requestState instead of synced via a useEffect:
  // useActionState already keeps the last action result around across
  // renders, so "did the OTP request succeed" has a single source of truth.
  // backToPhone is only an override for the explicit "Trocar telefone" link.
  const [backToPhone, setBackToPhone] = useState(false);
  const [requestState, requestAction, requestPending] = useActionState<PlayerAuthState, FormData>(
    requestPlayerOtp,
    null,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState<PlayerAuthState, FormData>(
    verifyPlayerOtp,
    null,
  );

  const otpSent = requestState && "success" in requestState;
  const step = otpSent && !backToPhone ? "verify" : "phone";
  const phone = otpSent ? requestState.phone : "";

  if (step === "phone") {
    return (
      <form
        action={requestAction}
        onSubmit={() => setBackToPhone(false)}
        className="flex w-full max-w-sm flex-col gap-5"
      >
        <Field label="Telefone" htmlFor="phone" hint="Vamos enviar um código por SMS">
          <PhoneInput id="phone" name="phone" required placeholder="(11) 91234-5678" />
        </Field>
        {requestState && "error" in requestState && <p className="error-text">{requestState.error}</p>}
        <Button type="submit" disabled={requestPending}>
          {requestPending ? "Enviando..." : "Enviar código"}
        </Button>
      </form>
    );
  }

  return (
    <form action={verifyAction} className="flex w-full max-w-sm flex-col gap-5">
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="next" value={next} />
      <p className="text-ink-dim text-sm">Enviamos um código por SMS para {phone}.</p>
      <Field label="Código" htmlFor="token">
        <Input id="token" name="token" type="text" inputMode="numeric" required placeholder="123456" />
      </Field>
      <Field label="Seu @tiktok" htmlFor="tiktok_handle" hint="Se já jogou em uma live, use o mesmo @">
        <Input id="tiktok_handle" name="tiktok_handle" type="text" required placeholder="@seuusuario" />
      </Field>
      <Field label="Nome" htmlFor="display_name" hint="Só é usado se for seu primeiro acesso">
        <Input id="display_name" name="display_name" type="text" placeholder="Seu nome" />
      </Field>

      {verifyState && "error" in verifyState && <p className="error-text">{verifyState.error}</p>}

      <Button type="submit" disabled={verifyPending}>
        {verifyPending ? "Confirmando..." : "Confirmar"}
      </Button>
      <button
        type="button"
        className="btn btn-ghost btn-sm self-start"
        onClick={() => setBackToPhone(true)}
      >
        Trocar telefone
      </button>
    </form>
  );
}
