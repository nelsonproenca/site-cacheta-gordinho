"use client";

import { useActionState, useState } from "react";
import { updatePlayer, deletePlayer, type ActionState } from "@/lib/actions/players";
import { TableRow, TableCell } from "@/components/ui/table";
import { Input, PhoneInput } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type Player = { id: string; display_name: string; tiktok_handle: string; whatsapp: string | null };

export function PlayerRow({ player, returnPath }: { player: Player; returnPath: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState<ActionState, FormData>(
    updatePlayer,
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState<ActionState, FormData>(
    deletePlayer,
    null,
  );

  const [prevUpdateState, setPrevUpdateState] = useState(updateState);
  if (updateState !== prevUpdateState) {
    setPrevUpdateState(updateState);
    if (updateState && "success" in updateState) {
      setIsEditing(false);
    }
  }

  if (isEditing) {
    return (
      <TableRow>
        <TableCell colSpan={4}>
          <form action={updateAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={player.id} />
            <input type="hidden" name="return_path" value={returnPath} />
            <div className="flex flex-col gap-2">
              <label htmlFor={`name-${player.id}`} className="caption">
                Nome
              </label>
              <Input
                id={`name-${player.id}`}
                name="display_name"
                type="text"
                required
                defaultValue={player.display_name}
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={`handle-${player.id}`} className="caption">
                @tiktok
              </label>
              <Input
                id={`handle-${player.id}`}
                name="tiktok_handle"
                type="text"
                required
                defaultValue={player.tiktok_handle}
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={`whatsapp-${player.id}`} className="caption">
                WhatsApp
              </label>
              <PhoneInput
                id={`whatsapp-${player.id}`}
                name="whatsapp"
                defaultValue={player.whatsapp ?? ""}
                className="w-40"
              />
            </div>
            <Button type="submit" size="sm" disabled={updatePending}>
              Salvar
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)}>
              Cancelar
            </Button>
            {updateState && "error" in updateState && (
              <p className="error-text w-full">{updateState.error}</p>
            )}
          </form>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      <TableRow>
        <TableCell className="driver-cell">{player.display_name}</TableCell>
        <TableCell className="mono-data" style={{ fontSize: 14 }}>
          @{player.tiktok_handle}
        </TableCell>
        <TableCell>{player.whatsapp ?? "—"}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="icon"
              aria-label="Editar jogador"
              title="Editar"
              onClick={() => setIsEditing(true)}
            >
              ✎
            </Button>
            <form action={deleteAction}>
              <input type="hidden" name="id" value={player.id} />
              <input type="hidden" name="return_path" value={returnPath} />
              <Button
                type="submit"
                variant="icon"
                disabled={deletePending}
                aria-label="Excluir jogador"
                title="Excluir"
                onClick={(e) => {
                  if (
                    !confirm(
                      `Excluir @${player.tiktok_handle}? Isso apaga também o histórico de participações e pontuações desse jogador.`,
                    )
                  ) {
                    e.preventDefault();
                  }
                }}
              >
                ✕
              </Button>
            </form>
          </div>
        </TableCell>
      </TableRow>
      {deleteState && "error" in deleteState && (
        <TableRow>
          <TableCell colSpan={4}>
            <p className="error-text">{deleteState.error}</p>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
