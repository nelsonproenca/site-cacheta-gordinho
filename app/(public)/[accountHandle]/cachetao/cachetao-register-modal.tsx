"use client";

import { useState } from "react";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { CachetaoRegisterForm } from "./cachetao-register-form";

export function CachetaoRegisterModal({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="lg" onClick={() => setOpen(true)}>
        Inscreva-se
      </Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalHeader title="Inscreva-se no Cachetão" onClose={() => setOpen(false)} />
        <CachetaoRegisterForm eventId={eventId} />
      </Modal>
    </>
  );
}
