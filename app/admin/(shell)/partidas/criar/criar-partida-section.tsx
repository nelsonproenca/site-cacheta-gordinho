"use client";

import { useActionState, useState } from "react";
import {
  createCrossAccountMatch,
  swapCrossAccountMatchPlayer,
  removeCrossAccountMatch,
  type ActionState,
} from "@/lib/actions/cross-account-matches";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { TableWrap, Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/table";

type Player = { id: string; display_name: string; tiktok_handle: string };
type Account = { id: string; handle: string; display_name: string };
type Live = { id: string; session_date: string; tiktok_account_id: string };
type Confronto = {
  id: string;
  liveSessionId: string;
  opponentLiveSessionId: string;
  player: Player;
  opponentPlayer: Player;
};

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
  confrontos,
}: {
  accounts: Account[];
  lives: Live[];
  liveParticipants: Record<string, Player[]>;
  confrontos: Confronto[];
}) {
  const [sideA, setSideA] = useState<Side>(emptySide);
  const [sideB, setSideB] = useState<Side>(emptySide);

  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCrossAccountMatch, null);
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state && "success" in state) {
      // Keep the account/live picked on each side — building several
      // confrontos in a row between the same two lives is the common case,
      // and re-navigating both dropdowns every time was the actual bug
      // being fixed here. Only the player choice clears, so the confrontos
      // list below (already filtered to this exact pair) just grows with
      // the new row instead of the whole form collapsing.
      setSideA((s) => ({ ...s, playerId: null }));
      setSideB((s) => ({ ...s, playerId: null }));
    }
  }

  const ready = !!(sideA.playerId && sideB.playerId);

  // Confrontos already built between whichever pair of lives is currently
  // selected, dos dois lados — the pairing may have landed in the DB either
  // way round (see createCrossAccountMatch's account_id try/swap), so match
  // both orderings and figure out per-row which side is "Jogador 1".
  const relevantConfrontos =
    sideA.liveId && sideB.liveId
      ? confrontos.filter(
          (c) =>
            (c.liveSessionId === sideA.liveId && c.opponentLiveSessionId === sideB.liveId) ||
            (c.liveSessionId === sideB.liveId && c.opponentLiveSessionId === sideA.liveId),
        )
      : [];

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

      {sideA.liveId && sideB.liveId && (
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
                    const aIsPlayer = c.liveSessionId === sideA.liveId;
                    const jogador1 = aIsPlayer ? c.player : c.opponentPlayer;
                    const jogador2 = aIsPlayer ? c.opponentPlayer : c.player;
                    const jogador1Side = aIsPlayer ? "player" : "opponent";
                    const jogador2Side = aIsPlayer ? "opponent" : "player";
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <PlayerCell
                            player={jogador1}
                            pool={liveParticipants[sideA.liveId] ?? []}
                            matchId={c.id}
                            side={jogador1Side}
                            sessionId={c.liveSessionId}
                            opponentLiveSessionId={c.opponentLiveSessionId}
                          />
                        </TableCell>
                        <TableCell>
                          <PlayerCell
                            player={jogador2}
                            pool={liveParticipants[sideB.liveId] ?? []}
                            matchId={c.id}
                            side={jogador2Side}
                            sessionId={c.liveSessionId}
                            opponentLiveSessionId={c.opponentLiveSessionId}
                          />
                        </TableCell>
                        <TableCell>
                          <RemoveButton
                            matchId={c.id}
                            sessionId={c.liveSessionId}
                            opponentLiveSessionId={c.opponentLiveSessionId}
                          />
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

// Jogador 1/2 cell in the confrontos list: name + an icon button that opens
// a modal listing that side's live participants to swap in — always the
// same pool the player was originally picked from (sideA's or sideB's live),
// not whatever "player"/"opponent" the row happens to be stored as in the DB.
function PlayerCell({
  player,
  pool,
  matchId,
  side,
  sessionId,
  opponentLiveSessionId,
}: {
  player: Player;
  pool: Player[];
  matchId: string;
  side: "player" | "opponent";
  sessionId: string;
  opponentLiveSessionId: string;
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
            <p className="text-ink-dim text-sm">Nenhum outro participante nessa live.</p>
          ) : (
            pool.map((p) => (
              <form key={p.id} action={formAction}>
                <input type="hidden" name="session_id" value={sessionId} />
                <input type="hidden" name="opponent_live_session_id" value={opponentLiveSessionId} />
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

function RemoveButton({
  matchId,
  sessionId,
  opponentLiveSessionId,
}: {
  matchId: string;
  sessionId: string;
  opponentLiveSessionId: string;
}) {
  return (
    <form action={removeCrossAccountMatch}>
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="opponent_live_session_id" value={opponentLiveSessionId} />
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
