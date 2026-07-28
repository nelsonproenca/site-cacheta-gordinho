"use client";

import { useActionState, useState } from "react";
import {
  createCachetaoCrossAccountMatch,
  swapCrossAccountMatchPlayer,
  removeCrossAccountMatch,
  type ActionState,
} from "@/lib/actions/cross-account-matches";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { TableWrap, Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

type Player = { id: string; display_name: string; tiktok_handle: string };
type Account = { id: string; handle: string; display_name: string };
type CachetaoEventOption = { id: string; event_date: string; tiktok_account_id: string; status: string };
type Confronto = {
  id: string;
  cachetaoEventId: string;
  opponentCachetaoEventId: string;
  player: Player;
  opponentPlayer: Player;
  winner?: "player" | "opponent" | null;
  scoringRuleName?: string | null;
  pointsAwarded?: number | null;
};
type LockedPartida = {
  id: string;
  name: string;
  accountAId: string;
  accountAHandle: string;
  cachetaoEventId: string;
  accountBId: string;
  accountBHandle: string;
  opponentCachetaoEventId: string;
};

type Side = {
  accountId: string;
  eventId: string;
  playerId: string | null;
};

const emptySide: Side = { accountId: "", eventId: "", playerId: null };

// `events` is already pre-filtered by the caller (page.tsx queries
// cachetao_events with status in registrations_closed/in_progress) —
// mirrors why the account-scoped Cachetão pairing button only appears once
// registrations are closed (CLAUDE.md, "Partidas: pairing 2 players").
export function CachetaoConfrontoSection({
  accounts,
  events,
  eventParticipants,
  confrontos,
  lockedPartida = null,
  readOnly = false,
}: {
  accounts: Account[];
  events: CachetaoEventOption[];
  eventParticipants: Record<string, Player[]>;
  confrontos: Confronto[];
  lockedPartida?: LockedPartida | null;
  readOnly?: boolean;
}) {
  const [sideA, setSideA] = useState<Side>(
    lockedPartida
      ? { accountId: lockedPartida.accountAId, eventId: lockedPartida.cachetaoEventId, playerId: null }
      : emptySide,
  );
  const [sideB, setSideB] = useState<Side>(
    lockedPartida
      ? { accountId: lockedPartida.accountBId, eventId: lockedPartida.opponentCachetaoEventId, playerId: null }
      : emptySide,
  );

  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCachetaoCrossAccountMatch, null);
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state && "success" in state) {
      setSideA((s) => ({ ...s, playerId: null }));
      setSideB((s) => ({ ...s, playerId: null }));
    }
  }

  const accountsChosenAndEqual = !!sideA.accountId && sideA.accountId === sideB.accountId;
  const playersChosenAndEqual = !!sideA.playerId && sideA.playerId === sideB.playerId;
  const ready = !!(sideA.playerId && sideB.playerId) && !accountsChosenAndEqual && !playersChosenAndEqual;

  const relevantConfrontos =
    sideA.eventId && sideB.eventId
      ? confrontos.filter(
          (c) =>
            (c.cachetaoEventId === sideA.eventId && c.opponentCachetaoEventId === sideB.eventId) ||
            (c.cachetaoEventId === sideB.eventId && c.opponentCachetaoEventId === sideA.eventId),
        )
      : [];

  // Either Cachetão has already finished — no participant pool left to build
  // a new confronto from, so this renders a plain read-only list instead of
  // the interactive picker below (no add/swap/remove).
  if (readOnly && lockedPartida) {
    return (
      <Card>
        <p className="font-display italic font-bold mb-6">
          @{lockedPartida.accountAHandle} <span className="text-ink-dim">vs</span> @{lockedPartida.accountBHandle}
        </p>
        <h2 className="font-display italic font-bold text-xl uppercase mb-4">Confrontos</h2>
        {confrontos.length === 0 ? (
          <p className="text-ink-dim text-sm">Nenhum confronto nessa partida.</p>
        ) : (
          <TableWrap>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Jogador 1</TableHeaderCell>
                  <TableHeaderCell>Jogador 2</TableHeaderCell>
                  <TableHeaderCell>Vencedor</TableHeaderCell>
                  <TableHeaderCell>Pontos</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {confrontos.map((c) => {
                  const aIsPlayer = c.cachetaoEventId === lockedPartida.cachetaoEventId;
                  const jogador1 = aIsPlayer ? c.player : c.opponentPlayer;
                  const jogador2 = aIsPlayer ? c.opponentPlayer : c.player;
                  const jogador1Wins = c.winner === (aIsPlayer ? "player" : "opponent");
                  const winnerName = c.winner ? (jogador1Wins ? jogador1.display_name : jogador2.display_name) : "";
                  const pontos =
                    c.pointsAwarded != null
                      ? `${c.scoringRuleName ? `${c.scoringRuleName} ` : ""}(${c.pointsAwarded > 0 ? "+" : ""}${c.pointsAwarded})`
                      : "";
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        {jogador1.display_name} <span className="text-ink-dim">@{jogador1.tiktok_handle}</span>
                      </TableCell>
                      <TableCell>
                        {jogador2.display_name} <span className="text-ink-dim">@{jogador2.tiktok_handle}</span>
                      </TableCell>
                      <TableCell>{winnerName}</TableCell>
                      <TableCell>{pontos}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    );
  }

  return (
    <Card>
      {lockedPartida && (
        <p className="caption mb-4">
          Editando: <span className="mono-data text-ink">{lockedPartida.name}</span>
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <SidePicker
          label="Jogador 1"
          accounts={accounts.filter((a) => a.id !== sideB.accountId)}
          events={events}
          eventParticipants={eventParticipants}
          side={sideA}
          onChange={setSideA}
          lockedHandle={lockedPartida?.accountAHandle}
        />
        <SidePicker
          label="Jogador 2"
          accounts={accounts.filter((a) => a.id !== sideA.accountId)}
          events={events}
          eventParticipants={eventParticipants}
          side={sideB}
          onChange={setSideB}
          lockedHandle={lockedPartida?.accountBHandle}
        />
      </div>

      {accountsChosenAndEqual && (
        <p className="alert-error mt-4">
          As duas contas são a mesma — selecione uma conta diferente para o outro lado.
        </p>
      )}
      {playersChosenAndEqual && (
        <p className="alert-error mt-4">
          O mesmo jogador foi escolhido dos dois lados — selecione um jogador diferente para o outro lado.
        </p>
      )}

      <form action={formAction} className="mt-6">
        <input type="hidden" name="side_a_account_id" value={sideA.accountId} />
        <input type="hidden" name="side_a_cachetao_event_id" value={sideA.eventId} />
        <input type="hidden" name="side_a_player_id" value={sideA.playerId ?? ""} />
        <input type="hidden" name="side_b_account_id" value={sideB.accountId} />
        <input type="hidden" name="side_b_cachetao_event_id" value={sideB.eventId} />
        <input type="hidden" name="side_b_player_id" value={sideB.playerId ?? ""} />
        {state && "error" in state && <p className="alert-error mb-3">{state.error}</p>}
        {state && "success" in state && <p className="text-sm text-green mb-3">{state.success}</p>}
        <Button type="submit" disabled={pending || !ready}>
          Adicionar jogadores à partida
        </Button>
      </form>

      {sideA.eventId && sideB.eventId && (
        <div className="mt-6">
          <h2 className="font-display italic font-bold text-xl uppercase mb-4">Confrontos</h2>
          {relevantConfrontos.length === 0 ? (
            <p className="text-ink-dim text-sm">Nenhum confronto montado ainda entre esses dois.</p>
          ) : (
            <TableWrap>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Jogador 1</TableHeaderCell>
                    <TableHeaderCell>Jogador 2</TableHeaderCell>
                    <TableHeaderCell>Opções</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {relevantConfrontos.map((c) => {
                    const aIsPlayer = c.cachetaoEventId === sideA.eventId;
                    const jogador1 = aIsPlayer ? c.player : c.opponentPlayer;
                    const jogador2 = aIsPlayer ? c.opponentPlayer : c.player;
                    const jogador1Side = aIsPlayer ? "player" : "opponent";
                    const jogador2Side = aIsPlayer ? "opponent" : "player";
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <PlayerCell
                            player={jogador1}
                            pool={eventParticipants[sideA.eventId] ?? []}
                            matchId={c.id}
                            side={jogador1Side}
                          />
                        </TableCell>
                        <TableCell>
                          <PlayerCell
                            player={jogador2}
                            pool={eventParticipants[sideB.eventId] ?? []}
                            matchId={c.id}
                            side={jogador2Side}
                          />
                        </TableCell>
                        <TableCell>
                          <RemoveButton matchId={c.id} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableWrap>
          )}
        </div>
      )}
    </Card>
  );
}

function SidePicker({
  label,
  accounts,
  events,
  eventParticipants,
  side,
  onChange,
  lockedHandle,
}: {
  label: string;
  accounts: Account[];
  events: CachetaoEventOption[];
  eventParticipants: Record<string, Player[]>;
  side: Side;
  onChange: (side: Side) => void;
  lockedHandle?: string;
}) {
  const eventsForAccount = events.filter((e) => e.tiktok_account_id === side.accountId);
  const pool = side.eventId ? (eventParticipants[side.eventId] ?? []) : [];

  if (lockedHandle) {
    return (
      <div className="flex flex-col gap-4">
        <p className="caption">{label}</p>
        <div>
          <p className="caption mb-1">Conta</p>
          <p className="font-semibold">@{lockedHandle}</p>
        </div>
        <div>
          <p className="caption mb-2">Participantes</p>
          {pool.length === 0 ? (
            <p className="text-ink-dim text-sm">Nenhum participante inscrito.</p>
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="caption">{label}</p>
      <Field label="Conta" htmlFor={`account-${label}`}>
        <Select
          id={`account-${label}`}
          value={side.accountId}
          onChange={(e) => {
            const accountId = e.target.value;
            const matches = events.filter((ev) => ev.tiktok_account_id === accountId);
            onChange({ accountId, eventId: matches.length === 1 ? matches[0].id : "", playerId: null });
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

      {side.accountId && eventsForAccount.length === 0 && (
        <p className="text-ink-dim text-sm">Essa conta não tem Cachetão pronto pra jogar no momento.</p>
      )}

      {side.accountId && eventsForAccount.length > 1 && (
        <Field label="Cachetão" htmlFor={`event-${label}`}>
          <Select
            id={`event-${label}`}
            value={side.eventId}
            onChange={(e) => onChange({ ...side, eventId: e.target.value, playerId: null })}
          >
            <option value="">Selecione</option>
            {eventsForAccount.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {formatDate(ev.event_date)}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {side.eventId && (
        <div>
          <p className="caption mb-2">Participantes</p>
          {pool.length === 0 ? (
            <p className="text-ink-dim text-sm">Nenhum participante inscrito.</p>
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

function PlayerCell({
  player,
  pool,
  matchId,
  side,
}: {
  player: Player;
  pool: Player[];
  matchId: string;
  side: "player" | "opponent";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(swapCrossAccountMatchPlayer, null);
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state && "success" in state) setOpen(false);
  }

  return (
    <div className="flex items-center gap-2">
      <span>
        {player.display_name} <span className="text-ink-dim">@{player.tiktok_handle}</span>
      </span>
      <Button type="button" variant="icon" aria-label="Trocar jogador" title="Trocar" onClick={() => setOpen(true)}>
        🔄
      </Button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalHeader title="Trocar jogador" onClose={() => setOpen(false)} />
        {state && "error" in state && <p className="alert-error mb-3">{state.error}</p>}
        <div className="flex flex-col gap-2">
          {pool.length === 0 ? (
            <p className="text-ink-dim text-sm">Nenhum outro participante nesse Cachetão.</p>
          ) : (
            pool.map((p) => (
              <form key={p.id} action={formAction}>
                <input type="hidden" name="match_id" value={matchId} />
                <input type="hidden" name="side" value={side} />
                <input type="hidden" name="new_player_id" value={p.id} />
                <Button
                  type="submit"
                  variant={p.id === player.id ? "primary" : "outline"}
                  size="sm"
                  className="justify-start w-full"
                  disabled={pending}
                >
                  {p.display_name} <span className="text-ink-dim">@{p.tiktok_handle}</span>
                </Button>
              </form>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}

function RemoveButton({ matchId }: { matchId: string }) {
  return (
    <form action={removeCrossAccountMatch}>
      <input type="hidden" name="match_id" value={matchId} />
      <Button
        type="submit"
        variant="icon"
        aria-label="Excluir confronto"
        title="Excluir"
        onClick={(e) => {
          if (!confirm("Remover este confronto?")) e.preventDefault();
        }}
      >
        ✕
      </Button>
    </form>
  );
}
