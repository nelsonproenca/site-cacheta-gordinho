"use client";

import { useState } from "react";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { RegisterPlayerForm } from "./register-player-form";

export function RegisterPlayerModal({ eventId, accountId }: { eventId: string; accountId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="badge badge-green" onClick={() => setOpen(true)}>
        + Adicionar jogador
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalHeader title="Inscrever jogador" onClose={() => setOpen(false)} />
        <RegisterPlayerForm eventId={eventId} accountId={accountId} />
      </Modal>
    </>
  );
}
