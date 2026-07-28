"use client";

import { useActionState, useState } from "react";
import {
  createPairedMatch,
  recordPairedResult,
  updatePairedResult,
  removePairedMatch,
  type ActionState,
} from "@/lib/actions/matches";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader } from "@/components/ui/modal";

type Player = { id: string; display_name: string; tiktok_handle: string };
type ScoringRule = { id: string; name: string; points: number };
type PairedResult = { id: string; scoring_rule_id: string; points_awarded: number; scoring_rules: { name: string } | null };
type PairedMatch = {
  id: string;
  playerA: Player;
  playerB: Player;
  resultA: PairedResult | null;
  resultB: PairedResult | null;
};

// Shared by /partidas/live/[sessionId] and /partidas/cachetao/[eventId] — the
// only difference between the two is which query built `pool`/`matches`
// (live_participants vs. active cachetao_registrations); everything about
// pairing two players and launching each side's result independently is
// identical (see lib/actions/matches.ts, mirroring the per-player pattern
// already used for lives' single-player results in results-table.tsx).
export function PartidasSection({
  accountId,
  sourceType,
  sourceId,
  sourceOpen,
  pool,
  matches,
  scoringRules,
}: {
  accountId: string;
  sourceType: "live" | "cachetao";
  sourceId: string;
  sourceOpen: boolean;
  pool: Player[];
  matches: PairedMatch[];
  scoringRules: ScoringRule[];
}) {
  const [modalTarget, setModalTarget] = useState<{ match: PairedMatch; player: Player; result: PairedResult | null } | null>(
    null,
  );

  return (
    <div className="flex flex-col gap-6">
      {sourceOpen && (
        <NewMatchForm accountId={accountId} sourceType={sourceType} sourceId={sourceId} pool={pool} />
      )}

      <div className="flex flex-col gap-3">
        {matches.map((m) => (
          <Card key={m.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <PlayerResultRow
                player={m.playerA}
                result={m.resultA}
                onLaunch={() => setModalTarget({ match: m, player: m.playerA, result: m.resultA })}
              />
              <span className="text-ink-dim font-display italic">vs</span>
              <PlayerResultRow
                player={m.playerB}
                result={m.resultB}
                onLaunch={() => setModalTarget({ match: m, player: m.playerB, result: m.resultB })}
              />
            </div>
            <div className="flex justify-end">
              <RemoveMatchButton accountId={accountId} sourceType={sourceType} sourceId={sourceId} match={m} />
            </div>
          </Card>
        ))}
        {matches.length === 0 && <p className="text-ink-dim text-sm">Nenhuma partida criada ainda.</p>}
      </div>

      <Modal open={modalTarget !== null} onClose={() => setModalTarget(null)}>
        {modalTarget && (
          <ResultForm
            accountId={accountId}
            sourceType={sourceType}
            sourceId={sourceId}
            matchId={modalTarget.match.id}
            player={modalTarget.player}
            currentResult={modalTarget.result}
            scoringRules={scoringRules}
            onDone={() => setModalTarget(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function PlayerResultRow({
  player,
  result,
  onLaunch,
}: {
  player: Player;
  result: PairedResult | null;
  onLaunch: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <div>
        <div className="font-display italic font-bold">{player.display_name}</div>
        <div className="text-ink-dim text-sm">@{player.tiktok_handle}</div>
        <div className="mono-data text-sm">
          {result ? (
            <>
              {result.scoring_rules?.name ?? "—"} ({result.points_awarded > 0 ? `+${result.points_awarded}` : result.points_awarded})
            </>
          ) : (
            <span className="text-ink-dim">Sem resultado</span>
          )}
        </div>
      </div>
      <Button type="button" variant="icon" aria-label={result ? "Editar resultado" : "Lançar resultado"} onClick={onLaunch}>
        {result ? "✎" : "+"}
      </Button>
    </div>
  );
}

function NewMatchForm({
  accountId,
  sourceType,
  sourceId,
  pool,
}: {
  accountId: string;
  sourceType: "live" | "cachetao";
  sourceId: string;
  pool: Player[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPairedMatch, null);
  const [formKey, setFormKey] = useState(0);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state && "success" in state) setFormKey((k) => k + 1);
  }

  if (pool.length < 2) {
    return <p className="text-ink-dim text-sm">É preciso pelo menos 2 participantes para criar uma partida.</p>;
  }

  return (
    <Card>
      <h2 className="font-display italic font-bold text-xl uppercase mb-4">Nova partida</h2>
      <form key={formKey} action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="account_id" value={accountId} />
        <input type="hidden" name="source_type" value={sourceType} />
        <input type="hidden" name="source_id" value={sourceId} />
        <div className="flex flex-col sm:flex-row gap-4">
          <Field label="Jogador 1" htmlFor="player_a_id" className="flex-1">
            <Select id="player_a_id" name="player_a_id" required defaultValue="">
              <option value="" disabled>
                Selecione
              </option>
              {pool.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} (@{p.tiktok_handle})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Jogador 2" htmlFor="player_b_id" className="flex-1">
            <Select id="player_b_id" name="player_b_id" required defaultValue="">
              <option value="" disabled>
                Selecione
              </option>
              {pool.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} (@{p.tiktok_handle})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {state && "error" in state && <p className="alert-error">{state.error}</p>}
        {state && "success" in state && <p className="text-sm text-green">{state.success}</p>}
        <div>
          <Button type="submit" disabled={pending}>
            Adicionar à lista de partidas
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ResultForm({
  accountId,
  sourceType,
  sourceId,
  matchId,
  player,
  currentResult,
  scoringRules,
  onDone,
}: {
  accountId: string;
  sourceType: "live" | "cachetao";
  sourceId: string;
  matchId: string;
  player: Player;
  currentResult: PairedResult | null;
  scoringRules: ScoringRule[];
  onDone: () => void;
}) {
  const action = currentResult ? updatePairedResult : recordPairedResult;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state && "success" in state) onDone();
  }

  return (
    <>
      <ModalHeader title="Lançar Resultado" onClose={onDone} />
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="account_id" value={accountId} />
        <input type="hidden" name="source_type" value={sourceType} />
        <input type="hidden" name="source_id" value={sourceId} />
        {currentResult ? (
          <input type="hidden" name="match_result_id" value={currentResult.id} />
        ) : (
          <>
            <input type="hidden" name="match_id" value={matchId} />
            <input type="hidden" name="player_id" value={player.id} />
          </>
        )}
        <Field label={`Resultado de ${player.display_name}`} htmlFor="scoring_rule_id">
          <Select
            id="scoring_rule_id"
            name="scoring_rule_id"
            required
            autoFocus
            defaultValue={currentResult?.scoring_rule_id ?? ""}
          >
            <option value="" disabled>
              Selecione
            </option>
            {scoringRules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.points > 0 ? `+${r.points}` : r.points})
              </option>
            ))}
          </Select>
        </Field>
        {state && "error" in state && <p className="alert-error">{state.error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            OK
          </Button>
        </div>
      </form>
    </>
  );
}

function RemoveMatchButton({
  accountId,
  sourceType,
  sourceId,
  match,
}: {
  accountId: string;
  sourceType: "live" | "cachetao";
  sourceId: string;
  match: PairedMatch;
}) {
  return (
    <form action={removePairedMatch}>
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="source_type" value={sourceType} />
      <input type="hidden" name="source_id" value={sourceId} />
      <input type="hidden" name="match_id" value={match.id} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        onClick={(e) => {
          if (!confirm(`Remover a partida entre ${match.playerA.display_name} e ${match.playerB.display_name}?`)) {
            e.preventDefault();
          }
        }}
      >
        Remover partida
      </Button>
    </form>
  );
}
