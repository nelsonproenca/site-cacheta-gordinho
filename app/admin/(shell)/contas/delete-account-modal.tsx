"use client";

import { useActionState, useState } from "react";
import { deleteTiktokAccount, type ActionState } from "@/lib/actions/accounts";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

// Deleting an account wipes every match/ranking/Caxetão record scoped to it
// (see delete_tiktok_account, 20260724000021) — a plain window.confirm() felt
// too weak for that blast radius, so this mirrors GitHub's "type the name to
// confirm" pattern instead: submit stays disabled until the typed text
// matches the account's own handle exactly.
export function DeleteAccountModal({ accountId, handle }: { accountId: string; handle: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(deleteTiktokAccount, null);

  const close = () => {
    setOpen(false);
    setTyped("");
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Excluir conta
      </Button>
      <Modal open={open} onClose={close}>
        <ModalHeader title="Excluir conta" onClose={close} />
        <p className="text-ink-dim text-sm mb-4">
          Isso apaga <strong>@{handle}</strong> e todo o histórico associado (ranking, lives, resultados,
          Caxetão) para sempre. Essa ação não pode ser desfeita.
        </p>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="tiktok_account_id" value={accountId} />
          <Field label={`Digite @${handle} para confirmar`} htmlFor="handle_confirmation">
            <Input
              id="handle_confirmation"
              name="handle_confirmation"
              type="text"
              autoComplete="off"
              placeholder={handle}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </Field>
          {state && "error" in state && <p className="alert-error">{state.error}</p>}
          {state && "success" in state && <p className="text-sm text-green">{state.success}</p>}
          <Button type="submit" variant="outline" disabled={pending || typed.trim().toLowerCase().replace(/^@+/, "") !== handle}>
            Excluir conta permanentemente
          </Button>
        </form>
      </Modal>
    </>
  );
}
