"use client";

import { useActionState } from "react";
import { updatePlatformSettings, type ActionState } from "@/lib/actions/platform-settings";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type Settings = {
  house_rake_percent: number;
  referral_commission_percent: number;
  pix_key: string | null;
  pix_key_owner_name: string | null;
};

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updatePlatformSettings, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <Field label="Taxa da casa (%)" htmlFor="house_rake_percent" className="w-48">
          <Input
            id="house_rake_percent"
            name="house_rake_percent"
            type="number"
            step="0.01"
            min={0}
            max={100}
            required
            defaultValue={settings.house_rake_percent}
          />
        </Field>
        <Field label="Comissão de indicação (%)" htmlFor="referral_commission_percent" className="w-48">
          <Input
            id="referral_commission_percent"
            name="referral_commission_percent"
            type="number"
            step="0.01"
            min={0}
            max={100}
            required
            defaultValue={settings.referral_commission_percent}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-4">
        <Field label="Chave Pix" htmlFor="pix_key" className="w-80">
          <Input id="pix_key" name="pix_key" type="text" defaultValue={settings.pix_key ?? ""} />
        </Field>
        <Field label="Nome do titular da chave" htmlFor="pix_key_owner_name" className="w-80">
          <Input
            id="pix_key_owner_name"
            name="pix_key_owner_name"
            type="text"
            defaultValue={settings.pix_key_owner_name ?? ""}
          />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          Salvar
        </Button>
      </div>
      {state && "error" in state && <p className="error-text">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-[var(--green)]">{state.success}</p>}
    </form>
  );
}
