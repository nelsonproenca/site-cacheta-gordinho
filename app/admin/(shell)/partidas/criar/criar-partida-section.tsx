"use client";

import { useActionState, useState } from "react";
import { createCrossAccountMatch, type ActionState } from "@/lib/actions/cross-account-matches";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type Player = { id: string; display_name: string; tiktok_handle: string };
type Account = { id: string; handle: string; display_name: string };
type Live = { id: string; session_date: string; tiktok_account_id: string };

type Side = {
  accountId: string;
  liveId: string;
  playerId: string | null;
};

const emptySide: Side = { accountId: "", liveId: "", playerId: null };

export function CriarPartidaSection({
  accounts,
  lives,
  liveParticipants,
}: {
  accounts: Account[];
  lives: Live[];
  liveParticipants: Record<string, Player[]>;
}) {
  const [sideA, setSideA] = useState<Side>(emptySide);
  const [sideB, setSideB] = useState<Side>(emptySide);

  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCrossAccountMatch, null);
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state && "success" in state) {
      setSideA(emptySide);
      setSideB(emptySide);
    }
  }

  const ready = !!(sideA.playerId && sideB.playerId);

  return (
    <Card>
      <div className="grid gap-6 sm:grid-cols-2">
        <SidePicker label="Jogador 1" accounts={accounts} lives={lives} liveParticipants={liveParticipants} side={sideA} onChange={setSideA} />
        <SidePicker label="Jogador 2" accounts={accounts} lives={lives} liveParticipants={liveParticipants} side={sideB} onChange={setSideB} />
      </div>

      <form action={formAction} className="mt-6">
        <input type="hidden" name="side_a_account_id" value={sideA.accountId} />
        <input type="hidden" name="side_a_live_session_id" value={sideA.liveId} />
        <input type="hidden" name="side_a_player_id" value={sideA.playerId ?? ""} />
        <input type="hidden" name="side_b_account_id" value={sideB.accountId} />
        <input type="hidden" name="side_b_live_session_id" value={sideB.liveId} />
        <input type="hidden" name="side_b_player_id" value={sideB.playerId ?? ""} />
        {state && "error" in state && <p className="alert-error mb-3">{state.error}</p>}
        {state && "success" in state && <p className="text-sm text-green mb-3">{state.success}</p>}
        <Button type="submit" disabled={pending || !ready}>
          Adicionar jogadores à partida
        </Button>
      </form>
    </Card>
  );
}

function SidePicker({
  label,
  accounts,
  lives,
  liveParticipants,
  side,
  onChange,
}: {
  label: string;
  accounts: Account[];
  lives: Live[];
  liveParticipants: Record<string, Player[]>;
  side: Side;
  onChange: (side: Side) => void;
}) {
  const livesForAccount = lives.filter((l) => l.tiktok_account_id === side.accountId);
  const pool = side.liveId ? (liveParticipants[side.liveId] ?? []) : [];

  return (
    <div className="flex flex-col gap-4">
      <p className="caption">{label}</p>
      <Field label="Conta" htmlFor={`account-${label}`}>
        <Select
          id={`account-${label}`}
          value={side.accountId}
          onChange={(e) => {
            const accountId = e.target.value;
            // Bring the account's open live automatically when there's
            // exactly one (the normal case) — no need to make the admin
            // pick a live that's already unambiguous.
            const matches = lives.filter((l) => l.tiktok_account_id === accountId);
            onChange({ accountId, liveId: matches.length === 1 ? matches[0].id : "", playerId: null });
          }}
        >
          <option value="">Selecione</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              @{a.handle} — {a.display_name}
            </option>
          ))}
        </Select>
      </Field>

      {side.accountId && livesForAccount.length === 0 && (
        <p className="text-ink-dim text-sm">Essa conta não tem live aberta no momento.</p>
      )}

      {side.accountId && livesForAccount.length > 1 && (
        <Field label="Live aberta" htmlFor={`live-${label}`}>
          <Select
            id={`live-${label}`}
            value={side.liveId}
            onChange={(e) => onChange({ ...side, liveId: e.target.value, playerId: null })}
          >
            <option value="">Selecione</option>
            {livesForAccount.map((l) => (
              <option key={l.id} value={l.id}>
                {new Date(l.session_date).toLocaleString("pt-BR")}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {side.liveId && (
        <div>
          <p className="caption mb-2">Participantes</p>
          {pool.length === 0 ? (
            <p className="text-ink-dim text-sm">Nenhum participante ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pool.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant={side.playerId === p.id ? "primary" : "outline"}
                  size="sm"
                  className="justify-start"
                  onClick={() => onChange({ ...side, playerId: p.id })}
                >
                  {p.display_name} <span className="text-ink-dim">@{p.tiktok_handle}</span>
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
