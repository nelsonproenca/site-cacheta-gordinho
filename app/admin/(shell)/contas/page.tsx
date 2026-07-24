import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardGrid } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddModeratorForm } from "./add-moderator-form";
import { DeleteAccountModal } from "./delete-account-modal";

export default async function ContasPage() {
  const supabase = await createClient();
  const { data: access } = await supabase
    .from("admin_account_access")
    .select("role, tiktok_accounts(id, handle, display_name, is_active)")
    .order("created_at", { ascending: true });

  const accounts = access ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Contas</h1>
        <p className="text-ink-dim">Contas TikTok que você administra ou modera.</p>
      </div>

      {accounts.length > 0 && (
        <CardGrid>
          {accounts.map((a) => {
            const account = a.tiktok_accounts;
            if (!account) return null;
            return (
              <Card key={account.id}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display italic font-bold text-lg">@{account.handle}</span>
                  <Badge variant={a.role === "owner" ? "purple" : "neutral"}>
                    {a.role === "owner" ? "Owner" : "Moderador"}
                  </Badge>
                </div>
                <p className="text-ink-dim text-sm mb-4">{account.display_name}</p>
                <div className="flex gap-2">
                  <Link className="btn btn-outline btn-sm" href={`/admin/${account.id}/pontuacao`}>
                    Gerenciar
                  </Link>
                  {a.role === "owner" && <DeleteAccountModal accountId={account.id} handle={account.handle} />}
                </div>
                {a.role === "owner" && <AddModeratorForm tiktokAccountId={account.id} />}
              </Card>
            );
          })}
        </CardGrid>
      )}
      {accounts.length === 0 && (
        <p className="text-ink-dim">
          Nenhuma conta cadastrada ainda.{" "}
          <Link href="/admin/contas/nova" className="text-red">
            Criar uma nova conta
          </Link>
          .
        </p>
      )}
    </div>
  );
}
