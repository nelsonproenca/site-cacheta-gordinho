import { createClient } from "@/lib/supabase/server";
import { approvePendingAdmin, rejectPendingAdmin } from "@/lib/actions/admin-approvals";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RejectButton } from "./reject-button";

export default async function SolicitacoesPage() {
  const supabase = await createClient();
  const { data: pending } = await supabase
    .from("admins")
    .select("id, name, email, created_at, user_type, streamer:admins!streamer_id(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const requests = pending ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Solicitações de acesso</h1>
        <p className="text-ink-dim">
          Cadastros de administrador aguardando aprovação. Aprovar segue o fluxo normal (o novo
          admin passa a poder criar/gerenciar contas); excluir remove o pedido — e o cadastro —
          por completo.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {requests.map((r) => (
          <Card key={r.id} className="flex flex-row items-center justify-between">
            <div>
              <span className="font-semibold">{r.name}</span>
              <p className="text-ink-dim text-sm">
                {r.email} · solicitado em {formatDateTime(r.created_at)}
              </p>
              <p className="text-ink-dim text-sm">
                {r.user_type === "moderador"
                  ? `Moderador · vinculado a ${r.streamer?.name ?? "—"}`
                  : r.user_type === "streamer"
                    ? "Streamer"
                    : "Tipo não informado"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <form action={approvePendingAdmin}>
                <input type="hidden" name="admin_id" value={r.id} />
                <Button type="submit" variant="outline" size="sm">
                  Aprovar
                </Button>
              </form>
              <form action={rejectPendingAdmin}>
                <input type="hidden" name="admin_id" value={r.id} />
                <RejectButton name={r.name} />
              </form>
            </div>
          </Card>
        ))}
        {requests.length === 0 && <p className="text-ink-dim">Nenhuma solicitação pendente.</p>}
      </div>
    </div>
  );
}
