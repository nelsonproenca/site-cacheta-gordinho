import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createOnlineTable, joinOnlineTable } from "@/lib/actions/cacheta";
import { Button } from "@/components/ui/button";
import { Card as UiCard } from "@/components/ui/card";

// Lobby do modo online (US2): criar uma mesa (createOnlineTable), listar as
// próprias mesas online ainda abertas (não uma vitrine pública de mesas de
// outros jogadores — ver nota em lib/actions/cacheta.ts), e entrar numa mesa
// existente pelo seu id, compartilhado fora da plataforma pelo criador.
export default async function OnlineLobbyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/jogar/entrar?next=/jogar/online");

  const { data: myPlayerId } = await supabase.rpc("current_player_id");
  if (!myPlayerId) redirect("/jogar/entrar?next=/jogar/online");

  const { data: mySeats } = await supabase
    .from("cacheta_table_seats")
    .select("table_id, cacheta_tables(id, mode, status, max_seats)")
    .eq("player_id", myPlayerId);

  const openTables = (mySeats ?? [])
    .map((s) => s.cacheta_tables)
    .filter((t): t is { id: string; mode: string; status: string; max_seats: number } => !!t && t.mode === "online" && t.status !== "finished");

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8 max-w-xl mx-auto w-full">
      <div>
        <p className="caption">Cacheta Gordinho</p>
        <h1 className="font-display text-2xl italic font-extrabold uppercase">Jogar online</h1>
        <p className="text-ink-dim text-sm mt-1">Crie uma mesa e compartilhe o link com outro jogador, ou entre numa mesa existente.</p>
      </div>

      {error && <p className="error-text">{error}</p>}

      <UiCard className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold uppercase">Criar mesa</h2>
        <form action={createOnlineTable}>
          <Button type="submit" variant="yellow">
            Criar nova mesa online
          </Button>
        </form>
      </UiCard>

      <UiCard className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold uppercase">Entrar com o código da mesa</h2>
        <form action={joinOnlineTable} className="flex gap-2">
          <input name="tableId" placeholder="id da mesa" className="input flex-1" required />
          <Button type="submit" variant="outline">
            Entrar
          </Button>
        </form>
      </UiCard>

      {openTables.length > 0 && (
        <UiCard className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold uppercase">Suas mesas abertas</h2>
          <ul className="flex flex-col gap-2">
            {openTables.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span className="mono-data text-sm">{t.id}</span>
                <Link href={`/jogar/${t.id}`} className="btn btn-outline btn-sm">
                  {t.status === "waiting" ? "Ver sala de espera" : "Continuar"}
                </Link>
              </li>
            ))}
          </ul>
        </UiCard>
      )}
    </main>
  );
}
