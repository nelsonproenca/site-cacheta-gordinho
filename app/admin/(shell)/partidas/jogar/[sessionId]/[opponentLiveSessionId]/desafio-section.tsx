"use client";

import { useActionState, useState } from "react";
import {
  setCrossAccountMatchWinner,
  setCrossAccountMatchPoints,
  type ActionState,
} from "@/lib/actions/cross-account-matches";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { TableWrap, Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/table";

type Player = { id: string; display_name: string; tiktok_handle: string };
type ScoringRule = { id: string; name: string; points: number };
type Confronto = {
  id: string;
  winner: "player" | "opponent" | null;
  scoringRuleId: string | null;
  scoringRuleName: string | null;
  pointsAwarded: number | null;
  player: Player;
  opponentPlayer: Player;
};

// Detail view of a "desafio" (every confronto ever created between two
// specific lives, see the parent page) — the "tela de execução" for
// launching scoring_rule/points per confronto. Jogador 1/2 are read-only
// here (swapping a player only happens on /partidas/criar);
export function DesafioSection({
  sessionId,
  opponentLiveSessionId,
  confrontos,
  scoringRules,
}: {
  sessionId: string;
  opponentLiveSessionId: string;
  confrontos: Confronto[];
  scoringRules: ScoringRule[];
}) {
  return (
    <div>
      <h2 className="font-display italic font-bold text-xl uppercase mb-4">Confrontos</h2>
      {confrontos.length === 0 ? (
        <p className="text-ink-dim text-sm">Nenhum confronto neste desafio.</p>
      ) : (
        <TableWrap>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Jogador 1</TableHeaderCell>
                <TableHeaderCell>Jogador 2</TableHeaderCell>
                <TableHeaderCell>Resultado</TableHeaderCell>
                <TableHeaderCell>Pontos</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {confrontos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    {c.player.display_name} <span className="text-ink-dim">@{c.player.tiktok_handle}</span>
                  </TableCell>
                  <TableCell>
                    {c.opponentPlayer.display_name}{" "}
                    <span className="text-ink-dim">@{c.opponentPlayer.tiktok_handle}</span>
                  </TableCell>
                  <TableCell>
                    <WinnerToggle sessionId={sessionId} opponentLiveSessionId={opponentLiveSessionId} match={c} />
                  </TableCell>
                  <TableCell>
                    <PontosCell
                      sessionId={sessionId}
                      opponentLiveSessionId={opponentLiveSessionId}
                      match={c}
                      rules={scoringRules}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}

function WinnerToggle({
  sessionId,
  opponentLiveSessionId,
  match,
}: {
  sessionId: string;
  opponentLiveSessionId: string;
  match: Confronto;
}) {
  return (
    <div className="flex gap-1">
      <form action={setCrossAccountMatchWinner}>
        <input type="hidden" name="session_id" value={sessionId} />
        <input type="hidden" name="opponent_live_session_id" value={opponentLiveSessionId} />
        <input type="hidden" name="match_id" value={match.id} />
        <input type="hidden" name="winner" value="player" />
        <Button type="submit" variant={match.winner === "player" ? "primary" : "outline"} size="sm">
          Jogador 1
        </Button>
      </form>
      <form action={setCrossAccountMatchWinner}>
        <input type="hidden" name="session_id" value={sessionId} />
        <input type="hidden" name="opponent_live_session_id" value={opponentLiveSessionId} />
        <input type="hidden" name="match_id" value={match.id} />
        <input type="hidden" name="winner" value="opponent" />
        <Button type="submit" variant={match.winner === "opponent" ? "primary" : "outline"} size="sm">
          Jogador 2
        </Button>
      </form>
    </div>
  );
}

function PontosCell({
  sessionId,
  opponentLiveSessionId,
  match,
  rules,
}: {
  sessionId: string;
  opponentLiveSessionId: string;
  match: Confronto;
  rules: ScoringRule[];
}) {
  const [pendingRuleId, setPendingRuleId] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setCrossAccountMatchPoints, null);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state && "success" in state) setPendingRuleId(null);
  }

  const winnerName = match.winner === "player" ? match.player.display_name : match.opponentPlayer.display_name;
  const pendingRule = rules.find((r) => r.id === pendingRuleId) ?? null;

  if (!match.winner) {
    return <span className="text-ink-dim text-sm">Defina o vencedor</span>;
  }

  return (
    <>
      {/* Controlled by the persisted value (match.scoringRuleId) on purpose —
          picking a new option never changes what's displayed until the
          server action succeeds and the page re-renders with the new
          value; "Cancelar" just closes the modal, so the <select> silently
          snaps back to the still-persisted option. */}
      <Select
        value={match.scoringRuleId ?? ""}
        onChange={(e) => {
          if (e.target.value) setPendingRuleId(e.target.value);
        }}
      >
        <option value="" disabled>
          Selecione
        </option>
        {rules.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} ({r.points > 0 ? `+${r.points}` : r.points})
          </option>
        ))}
      </Select>

      <Modal open={pendingRuleId !== null} onClose={() => setPendingRuleId(null)}>
        <ModalHeader title="Confirmar resultado" onClose={() => setPendingRuleId(null)} />
        {pendingRule && (
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="session_id" value={sessionId} />
            <input type="hidden" name="opponent_live_session_id" value={opponentLiveSessionId} />
            <input type="hidden" name="match_id" value={match.id} />
            <input type="hidden" name="scoring_rule_id" value={pendingRule.id} />
            <p>
              {winnerName} — {pendingRule.name} ({pendingRule.points > 0 ? `+${pendingRule.points}` : pendingRule.points})
            </p>
            <p>Deseja salvar esse resultado?</p>
            {state && "error" in state && <p className="alert-error">{state.error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPendingRuleId(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                OK
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
