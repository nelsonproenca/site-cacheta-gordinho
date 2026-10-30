import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TableBoard } from "@/components/cacheta/table-board";

export default async function MesaPage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/entrar?next=/jogar/${tableId}`);

  const { data: myPlayerId } = await supabase.rpc("current_player_id");
  if (!myPlayerId) redirect(`/entrar?next=/jogar/${tableId}`);

  // RLS (cacheta_tables_select_seated) já garante que só quem tem assento
  // nesta mesa consegue ler a linha — um id inválido ou de outra mesa não
  // volta nada aqui.
  const { data: table } = await supabase.from("cacheta_tables").select("id, status").eq("id", tableId).maybeSingle();
  if (!table) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-6 sm:p-8 max-w-xl mx-auto w-full">
        <h1 className="font-display text-2xl italic font-extrabold uppercase">Mesa não encontrada</h1>
        <p className="text-ink-dim">Esta mesa não existe ou você não tem um assento nela.</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-6 sm:p-8 max-w-2xl mx-auto w-full">
      <p className="caption">Cacheta Gordinho</p>
      <h1 className="font-display text-2xl italic font-extrabold uppercase">Mesa de Cacheta</h1>
      {table.status === "waiting" ? (
        <p className="text-ink-dim">Aguardando os demais jogadores entrarem...</p>
      ) : (
        <TableBoard tableId={tableId} myPlayerId={myPlayerId} />
      )}
    </main>
  );
}
