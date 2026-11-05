"use client";

import { useActionState } from "react";
import { toggleCoinPackage, deleteCoinPackage, type ActionState } from "@/lib/actions/coin-packages";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Package = { id: string; name: string; price_brl: number; coin_amount: number; active: boolean };

export function PackageCard({ pkg }: { pkg: Package }) {
  const [deleteState, deleteAction, deletePending] = useActionState<ActionState, FormData>(
    deleteCoinPackage,
    null,
  );

  return (
    <Card className="flex flex-row items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="mono-data text-lg">R$ {Number(pkg.price_brl).toFixed(2)}</span>
        <span className="font-semibold">{pkg.name}</span>
        <span className="text-ink-dim text-sm">{pkg.coin_amount} moedas</span>
        <Badge variant={pkg.active ? "green" : "neutral"}>{pkg.active ? "Ativo" : "Inativo"}</Badge>
      </div>
      <div className="flex items-center gap-2">
        <form action={toggleCoinPackage}>
          <input type="hidden" name="id" value={pkg.id} />
          <input type="hidden" name="active" value={String(pkg.active)} />
          <Button type="submit" variant="outline" size="sm">
            {pkg.active ? "Desativar" : "Ativar"}
          </Button>
        </form>
        <form action={deleteAction}>
          <input type="hidden" name="id" value={pkg.id} />
          <Button
            type="submit"
            variant="icon"
            disabled={deletePending}
            aria-label="Excluir pacote"
            title="Excluir"
            onClick={(e) => {
              if (!confirm(`Excluir o pacote "${pkg.name}"?`)) e.preventDefault();
            }}
          >
            ✕
          </Button>
        </form>
      </div>
      {deleteState && "error" in deleteState && <p className="error-text w-full mt-2">{deleteState.error}</p>}
    </Card>
  );
}
