"use client";

import { useActionState, useState } from "react";
import {
  toggleScoringRule,
  updateScoringRule,
  deleteScoringRule,
  type ActionState,
} from "@/lib/actions/scoring-rules";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type Rule = { id: string; name: string; points: number; is_active: boolean };

export function RuleCard({ rule, isSuperAdmin }: { rule: Rule; isSuperAdmin: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState<ActionState, FormData>(
    updateScoringRule,
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState<ActionState, FormData>(
    deleteScoringRule,
    null,
  );

  const [prevUpdateState, setPrevUpdateState] = useState(updateState);
  if (updateState !== prevUpdateState) {
    setPrevUpdateState(updateState);
    if (updateState && "success" in updateState) {
      setIsEditing(false);
    }
  }

  if (isEditing && isSuperAdmin) {
    return (
      <Card>
        <form action={updateAction} className="flex flex-wrap items-end gap-4">
          <input type="hidden" name="id" value={rule.id} />
          <Field label="Nome do resultado" htmlFor={`name-${rule.id}`} className="w-80">
            <Input id={`name-${rule.id}`} name="name" type="text" required defaultValue={rule.name} />
          </Field>
          <Field label="Pontos" htmlFor={`points-${rule.id}`} className="w-60">
            <Input
              id={`points-${rule.id}`}
              name="points"
              type="number"
              required
              step="1"
              defaultValue={rule.points}
            />
          </Field>
          <Button type="submit" disabled={updatePending}>
            Salvar
          </Button>
          <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
            Cancelar
          </Button>
          {updateState && "error" in updateState && (
            <p className="error-text w-full">{updateState.error}</p>
          )}
        </form>
      </Card>
    );
  }

  return (
    <Card className="flex flex-row items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="mono-data text-lg">{rule.points > 0 ? `+${rule.points}` : rule.points}</span>
        <span className="font-semibold">{rule.name}</span>
        <Badge variant={rule.is_active ? "green" : "neutral"}>
          {rule.is_active ? "Ativa" : "Inativa"}
        </Badge>
      </div>
      {isSuperAdmin && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            Editar
          </Button>
          <form action={toggleScoringRule}>
            <input type="hidden" name="id" value={rule.id} />
            <input type="hidden" name="is_active" value={String(rule.is_active)} />
            <Button type="submit" variant="outline" size="sm">
              {rule.is_active ? "Desativar" : "Ativar"}
            </Button>
          </form>
          <form action={deleteAction}>
            <input type="hidden" name="id" value={rule.id} />
            <Button
              type="submit"
              variant="icon"
              disabled={deletePending}
              aria-label="Excluir regra"
              title="Excluir"
              onClick={(e) => {
                if (!confirm(`Excluir a regra "${rule.name}"?`)) {
                  e.preventDefault();
                }
              }}
            >
              ✕
            </Button>
          </form>
        </div>
      )}
      {deleteState && "error" in deleteState && (
        <p className="error-text w-full mt-2">{deleteState.error}</p>
      )}
    </Card>
  );
}
