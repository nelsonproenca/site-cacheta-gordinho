"use client";

import { useActionState, useState } from "react";
import { createCaxetaoEvent, type ActionState } from "@/lib/actions/caxetao";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cn, nowInSaoPauloAsDatetimeLocal } from "@/lib/utils";

type CloseRule = "time" | "count";
type Account = { id: string; handle: string; display_name: string };

// accountId is fixed (hidden input) when reached from within an account's
// own /admin/[accountId]/caxetao page. The global /admin/caxetao/criar entry
// point has no account in the URL, so it passes `accounts` instead and this
// renders a <select> in its place — same form either way, createCaxetaoEvent
// doesn't care which path supplied tiktok_account_id.
export function CreateEventForm({ accountId, accounts }: { accountId: string; accounts?: never } | { accountId?: never; accounts: Account[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCaxetaoEvent, null);
  const [closeRule, setCloseRule] = useState<CloseRule>("time");
  const [formKey, setFormKey] = useState(0);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state && "success" in state) {
      setFormKey((k) => k + 1);
      setCloseRule("time");
    }
  }

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-4">
      {accountId ? (
        <input type="hidden" name="tiktok_account_id" value={accountId} />
      ) : (
        <Field label="Conta" htmlFor="tiktok_account_id">
          <Select id="tiktok_account_id" name="tiktok_account_id" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            {accounts!.map((a) => (
              <option key={a.id} value={a.id}>
                @{a.handle} — {a.display_name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <input type="hidden" name="close_rule" value={closeRule} />
      {/* close_rule 'count' has no scheduled opening — registration starts
          the moment the event is created, so registration_opens_at is
          submitted here instead of via a field the admin has to fill. */}
      {closeRule === "count" && (
        <input type="hidden" name="registration_opens_at" value={nowInSaoPauloAsDatetimeLocal()} />
      )}

      <div className="grid grid-cols-3 gap-4 items-end">
        <Field label="Data do evento" htmlFor="event_date">
          <Input id="event_date" name="event_date" type="date" required />
        </Field>

        <Field label="Regra de encerramento">
          <div className="flex gap-2">
            <button
              type="button"
              className={cn("btn btn-sm flex-1 justify-center", closeRule === "time" ? "btn-primary" : "btn-outline")}
              onClick={() => setCloseRule("time")}
            >
              Por tempo
            </button>
            <button
              type="button"
              className={cn("btn btn-sm flex-1 justify-center", closeRule === "count" ? "btn-primary" : "btn-outline")}
              onClick={() => setCloseRule("count")}
            >
              Por quantidade
            </button>
          </div>
        </Field>

        <Button type="submit" disabled={pending} className="w-full justify-center">
          Criar Caxetão
        </Button>
      </div>

      {/* Conditional fields always render on their own row below, never
          sharing a row with Data do evento / Regra de encerramento. */}
      <div className="grid grid-cols-3 gap-4">
        {closeRule === "time" && (
          <>
            <Field label="Inscrições abrem" htmlFor="registration_opens_at">
              <Input id="registration_opens_at" name="registration_opens_at" type="datetime-local" required />
            </Field>
            <Field label="Inscrições fecham" htmlFor="registration_closes_at">
              <Input id="registration_closes_at" name="registration_closes_at" type="datetime-local" required />
            </Field>
          </>
        )}
        {closeRule === "count" && (
          <>
            <Field label="Vagas principais" htmlFor="max_principals">
              <Input id="max_principals" name="max_principals" type="number" min={1} step={1} required />
            </Field>
            <Field label="Vagas suplente" htmlFor="max_substitutes">
              <Input id="max_substitutes" name="max_substitutes" type="number" min={0} step={1} />
            </Field>
          </>
        )}
      </div>
      {state && "error" in state && <p className="error-text">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-green">{state.success}</p>}
    </form>
  );
}
