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
