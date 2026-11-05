import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Cria uma mesa contra robôs e já inicia a partida (sem necessidade de
// esperar outros jogadores — diferente do modo online, ver /jogar/online),
// redirecionando direto para a mesa jogável.
export default async function TreinoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/jogar/entrar?next=/jogar/treino");

  // create_cacheta_table rejeita um segundo assento ativo por jogador (ver
  // 20261029000041). Isso é esperado — basta acontecer de o jogador já ter
  // uma mesa não finalizada (abriu /jogar/treino de novo, voltou no
  // navegador) — então antes de tentar criar, reaproveita a mesa ativa já
  // existente em vez de deixar a RPC falhar (mesmo padrão de
  // getOrCreateOpenLiveSession para lives).
  const { data: myPlayerId } = await supabase.rpc("current_player_id");
  if (myPlayerId) {
    const { data: activeSeats } = await supabase
      .from("cacheta_table_seats")
      .select("table_id, cacheta_tables(id, status)")
      .eq("player_id", myPlayerId);
    const activeTable = (activeSeats ?? [])
      .map((s) => s.cacheta_tables)
      .find((t): t is { id: string; status: string } => !!t && t.status !== "finished");
    if (activeTable) redirect(`/jogar/${activeTable.id}`);
  }

  const { data: tableId, error: createError } = await supabase.rpc("create_cacheta_table", {
    p_mode: "bots",
    p_max_seats: 4,
  });

  if (createError || !tableId) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-6 sm:p-8 max-w-xl mx-auto w-full">
        <h1 className="font-display text-2xl italic font-extrabold uppercase">Não foi possível criar a mesa</h1>
        <p className="error-text">{createError?.message ?? "Erro desconhecido"}</p>
      </main>
    );
  }

  await supabase.rpc("start_cacheta_game", { p_table_id: tableId });

  redirect(`/jogar/${tableId}`);
}
