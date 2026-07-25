"use client";

import { useActionState, useState } from "react";
import { createCrossAccountMatch, type ActionState } from "@/lib/actions/cross-account-matches";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type Player = { id: string; display_name: string; tiktok_handle: string };
type Streamer = { id: string; name: string };
type Live = { id: string; session_date: string; tiktok_account_id: string; account_handle: string; streamer_id: string };

type Side = {
  streamerId: string;
  liveId: string;
  playerId: string | null;
};

const emptySide: Side = { streamerId: "", liveId: "", playerId: null };

export function CriarPartidaSection({
  streamers,
  lives,
  liveParticipants,
}: {
  streamers: Streamer[];
  lives: Live[];
  liveParticipants: Record<string, Player[]>;
}) {
  const [sideA, setSideA] = useState<Side>(emptySide);
  const [sideB, setSideB] = useState<Side>(emptySide);

  const liveA = lives.find((l) => l.id === sideA.liveId) ?? null;
  const liveB = lives.find((l) => l.id === sideB.liveId) ?? null;

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
        <SidePicker label="Lado A" streamers={streamers} lives={lives} liveParticipants={liveParticipants} side={sideA} onChange={setSideA} />
        <SidePicker label="Lado B" streamers={streamers} lives={lives} liveParticipants={liveParticipants} side={sideB} onChange={setSideB} />
      </div>

      <form action={formAction} className="mt-6">
        <input type="hidden" name="side_a_account_id" value={liveA?.tiktok_account_id ?? ""} />
        <input type="hidden" name="side_a_live_session_id" value={sideA.liveId} />
        <input type="hidden" name="side_a_player_id" value={sideA.playerId ?? ""} />
        <input type="hidden" name="side_b_account_id" value={liveB?.tiktok_account_id ?? ""} />
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
  streamers,
  lives,
  liveParticipants,
  side,
  onChange,
}: {
  label: string;
  streamers: Streamer[];
  lives: Live[];
  liveParticipants: Record<string, Player[]>;
  side: Side;
  onChange: (side: Side) => void;
}) {
  const livesForStreamer = lives.filter((l) => l.streamer_id === side.streamerId);
  const pool = side.liveId ? (liveParticipants[side.liveId] ?? []) : [];

  return (
    <div className="flex flex-col gap-4">
      <p className="caption">{label}</p>
      <Field label="Streamer" htmlFor={`streamer-${label}`}>
        <Select
          id={`streamer-${label}`}
          value={side.streamerId}
          onChange={(e) => onChange({ streamerId: e.target.value, liveId: "", playerId: null })}
        >
          <option value="">Selecione</option>
          {streamers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      {side.streamerId && livesForStreamer.length === 0 && (
        <p className="text-ink-dim text-sm">Esse streamer não tem lives abertas no momento.</p>
      )}

      {side.streamerId && livesForStreamer.length > 0 && (
        <Field label="Live aberta" htmlFor={`live-${label}`}>
          <Select
            id={`live-${label}`}
            value={side.liveId}
            onChange={(e) => onChange({ ...side, liveId: e.target.value, playerId: null })}
          >
            <option value="">Selecione</option>
            {livesForStreamer.map((l) => (
              <option key={l.id} value={l.id}>
                @{l.account_handle} — {new Date(l.session_date).toLocaleString("pt-BR")}
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
