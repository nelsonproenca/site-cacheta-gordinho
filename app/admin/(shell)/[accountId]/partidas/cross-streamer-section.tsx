"use client";

import { useActionState, useState } from "react";
import {
  createCrossAccountMatch,
  setCrossAccountMatchWinner,
  swapCrossAccountMatchPlayer,
  removeCrossAccountMatch,
  type ActionState,
} from "@/lib/actions/cross-account-matches";
import { notifyStreamer, type ActionState as NotifyActionState } from "@/lib/actions/notifications";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { TableWrap, Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/table";

type Player = { id: string; display_name: string; tiktok_handle: string };
type OtherStreamer = { id: string; name: string };
type OtherLive = { id: string; session_date: string; tiktok_account_id: string; account_handle: string; streamer_id: string };
type Confronto = {
  id: string;
  winner: "player" | "opponent" | null;
  opponentLiveSessionId: string;
  player: Player;
  opponentPlayer: Player;
  opponentAccountHandle: string;
};

// Builds a "confronto" — one player from MY open live paired against one
// player from a DIFFERENT streamer's open live. Deliberately separate from
// partidas-section.tsx (same-account pairing, still used by Caxetão): this
// writes to cross_account_matches, not matches/match_results, and carries no
// scoring_rule/points yet (see 20260724000025 — that's a later screen).
export function CrossStreamerSection({
  accountId,
  sessionId,
  sourceOpen,
  myPool,
  otherStreamers,
  otherLives,
  otherLiveParticipants,
  confrontos,
}: {
  accountId: string;
  sessionId: string;
  sourceOpen: boolean;
  myPool: Player[];
  otherStreamers: OtherStreamer[];
  otherLives: OtherLive[];
  otherLiveParticipants: Record<string, Player[]>;
  confrontos: Confronto[];
}) {
  const [selectedStreamerId, setSelectedStreamerId] = useState("");
  const [selectedOtherLiveId, setSelectedOtherLiveId] = useState("");
  const [selectedMyPlayerId, setSelectedMyPlayerId] = useState<string | null>(null);
  const [selectedOtherPlayerId, setSelectedOtherPlayerId] = useState<string | null>(null);

  const livesForStreamer = otherLives.filter((l) => l.streamer_id === selectedStreamerId);
  const otherPool = selectedOtherLiveId ? (otherLiveParticipants[selectedOtherLiveId] ?? []) : [];
  const selectedOtherLive = otherLives.find((l) => l.id === selectedOtherLiveId) ?? null;

  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCrossAccountMatch, null);
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state && "success" in state) {
      setSelectedMyPlayerId(null);
      setSelectedOtherPlayerId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {sourceOpen && (
        <Card>
          <h2 className="font-display italic font-bold text-xl uppercase mb-4">Montar confronto</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="caption mb-2">Meus participantes</p>
              <PlayerList players={myPool} selectedId={selectedMyPlayerId} onSelect={setSelectedMyPlayerId} />
            </div>
            <div className="flex flex-col gap-4">
              <Field label="Streamer" htmlFor="streamer_id">
                <Select
                  id="streamer_id"
                  value={selectedStreamerId}
                  onChange={(e) => {
                    setSelectedStreamerId(e.target.value);
                    setSelectedOtherLiveId("");
                    setSelectedOtherPlayerId(null);
                  }}
                >
                  <option value="">Selecione</option>
                  {otherStreamers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {otherStreamers.length === 0 && (
                <p className="text-ink-dim text-sm">Nenhum outro streamer cadastrado ainda.</p>
              )}
              {selectedStreamerId && <NotifyStreamerButton recipientAdminId={selectedStreamerId} />}
              {selectedStreamerId && (
                <Field label="Live aberta" htmlFor="other_live_id">
                  <Select
                    id="other_live_id"
                    value={selectedOtherLiveId}
                    onChange={(e) => {
                      setSelectedOtherLiveId(e.target.value);
                      setSelectedOtherPlayerId(null);
                    }}
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
              {selectedStreamerId && livesForStreamer.length === 0 && (
                <p className="text-ink-dim text-sm">Esse streamer não tem lives abertas no momento.</p>
              )}
              {selectedOtherLiveId && (
                <div>
                  <p className="caption mb-2">Participantes de @{selectedOtherLive?.account_handle}</p>
                  <PlayerList players={otherPool} selectedId={selectedOtherPlayerId} onSelect={setSelectedOtherPlayerId} />
                </div>
              )}
            </div>
          </div>

          <form action={formAction} className="mt-4">
            <input type="hidden" name="account_id" value={accountId} />
            <input type="hidden" name="live_session_id" value={sessionId} />
            <input type="hidden" name="player_id" value={selectedMyPlayerId ?? ""} />
            <input type="hidden" name="opponent_account_id" value={selectedOtherLive?.tiktok_account_id ?? ""} />
            <input type="hidden" name="opponent_live_session_id" value={selectedOtherLiveId} />
            <input type="hidden" name="opponent_player_id" value={selectedOtherPlayerId ?? ""} />
            {state && "error" in state && <p className="alert-error mb-3">{state.error}</p>}
            {state && "success" in state && <p className="text-sm text-green mb-3">{state.success}</p>}
            <Button type="submit" disabled={pending || !selectedMyPlayerId || !selectedOtherPlayerId}>
              Adicionar jogadores à partida
            </Button>
          </form>
        </Card>
      )}

      <div>
        <h2 className="font-display italic font-bold text-xl uppercase mb-4">Confrontos</h2>
        {confrontos.length === 0 ? (
          <p className="text-ink-dim text-sm">Nenhum confronto montado ainda.</p>
        ) : (
          <TableWrap>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Jogador 1 (meu lado)</TableHeaderCell>
                  <TableHeaderCell>Jogador 2 (@streamer)</TableHeaderCell>
                  <TableHeaderCell>Vencedor</TableHeaderCell>
                  <TableHeaderCell>Ações</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {confrontos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <SwapPlayerCell
                        accountId={accountId}
                        sessionId={sessionId}
                        match={c}
                        side="player"
                        pool={myPool}
                      />
                    </TableCell>
                    <TableCell>
                      <SwapPlayerCell
                        accountId={accountId}
                        sessionId={sessionId}
                        match={c}
                        side="opponent"
                        pool={otherLiveParticipants[c.opponentLiveSessionId] ?? []}
                        suffix={`@${c.opponentAccountHandle}`}
                      />
                    </TableCell>
                    <TableCell>
                      <WinnerToggle accountId={accountId} sessionId={sessionId} match={c} />
                    </TableCell>
                    <TableCell>
                      <RemoveButton accountId={accountId} sessionId={sessionId} matchId={c.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrap>
        )}
      </div>
    </div>
  );
}

function PlayerList({
  players,
  selectedId,
  onSelect,
}: {
  players: Player[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (players.length === 0) {
    return <p className="text-ink-dim text-sm">Nenhum participante ainda.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {players.map((p) => (
        <Button
          key={p.id}
          type="button"
          variant={selectedId === p.id ? "primary" : "outline"}
          size="sm"
          className="justify-start"
          onClick={() => onSelect(p.id)}
        >
          {p.display_name} <span className="text-ink-dim">@{p.tiktok_handle}</span>
        </Button>
      ))}
    </div>
  );
}

function NotifyStreamerButton({ recipientAdminId }: { recipientAdminId: string }) {
  const [state, formAction, pending] = useActionState<NotifyActionState, FormData>(notifyStreamer, null);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="recipient_admin_id" value={recipientAdminId} />
      <Button type="submit" variant="outline" disabled={pending}>
        Iniciar partida
      </Button>
      {state && "error" in state && <p className="alert-error">{state.error}</p>}
      {state && "success" in state && <p className="text-sm text-green">{state.success}</p>}
    </form>
  );
}

// "Trocar" a single side of an already-created confronto for a different
// player from the same live, instead of removing + recreating the row.
// side="player" pulls its options from myPool (the logged-in streamer's own
// live); side="opponent" pulls from that specific confronto's own
// opponent live pool (via cross-streamer-section's otherLiveParticipants map,
// keyed by opponentLiveSessionId) — not whatever streamer/live happens to be
// selected in the "montar confronto" form above.
function SwapPlayerCell({
  accountId,
  sessionId,
  match,
  side,
  pool,
  suffix,
}: {
  accountId: string;
  sessionId: string;
  match: Confronto;
  side: "player" | "opponent";
  pool: Player[];
  suffix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(swapCrossAccountMatchPlayer, null);
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state && "success" in state) setEditing(false);
  }

  const current = side === "player" ? match.player : match.opponentPlayer;

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span>
          {current.display_name} <span className="text-ink-dim">@{current.tiktok_handle}{suffix ? ` · ${suffix}` : ""}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Trocar
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 min-w-[220px]">
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="live_session_id" value={sessionId} />
      <input type="hidden" name="match_id" value={match.id} />
      <input type="hidden" name="side" value={side} />
      <Select name="new_player_id" defaultValue={current.id} required autoFocus>
        {pool.map((p) => (
          <option key={p.id} value={p.id}>
            {p.display_name} (@{p.tiktok_handle})
          </option>
        ))}
      </Select>
      {state && "error" in state && <p className="alert-error">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          Confirmar
        </Button>
      </div>
    </form>
  );
}

function WinnerToggle({
  accountId,
  sessionId,
  match,
}: {
  accountId: string;
  sessionId: string;
  match: Confronto;
}) {
  return (
    <div className="flex gap-1">
      <form action={setCrossAccountMatchWinner}>
        <input type="hidden" name="account_id" value={accountId} />
        <input type="hidden" name="live_session_id" value={sessionId} />
        <input type="hidden" name="match_id" value={match.id} />
        <input type="hidden" name="winner" value="player" />
        <Button type="submit" variant={match.winner === "player" ? "primary" : "outline"} size="sm">
          Jogador 1
        </Button>
      </form>
      <form action={setCrossAccountMatchWinner}>
        <input type="hidden" name="account_id" value={accountId} />
        <input type="hidden" name="live_session_id" value={sessionId} />
        <input type="hidden" name="match_id" value={match.id} />
        <input type="hidden" name="winner" value="opponent" />
        <Button type="submit" variant={match.winner === "opponent" ? "primary" : "outline"} size="sm">
          Jogador 2
        </Button>
      </form>
    </div>
  );
}

function RemoveButton({ accountId, sessionId, matchId }: { accountId: string; sessionId: string; matchId: string }) {
  return (
    <form action={removeCrossAccountMatch}>
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="live_session_id" value={sessionId} />
      <input type="hidden" name="match_id" value={matchId} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        onClick={(e) => {
          if (!confirm("Remover este confronto?")) e.preventDefault();
        }}
      >
        Remover
      </Button>
    </form>
  );
}
