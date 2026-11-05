import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { joinOnlineTable } from "@/lib/actions/cacheta";
import { Button } from "@/components/ui/button";
import { Card as UiCard } from "@/components/ui/card";
import { CreateOnlineTableForm } from "@/components/cacheta/create-online-table-form";

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

  const { data: isGuest } = await supabase.rpc("current_player_is_guest");
  let balance: number | null = null;
  if (!isGuest) {
    const { data: movements } = await supabase.from("wallet_movements").select("amount").eq("player_id", myPlayerId);
    balance = (movements ?? []).reduce((sum, m) => sum + m.amount, 0);
  }

  const { data: mySeats } = await supabase
    .from("cacheta_table_seats")
    .select("table_id, cacheta_tables(id, mode, status, max_seats, entry_amount)")
    .eq("player_id", myPlayerId);

  const openTables = (mySeats ?? [])
    .map((s) => s.cacheta_tables)
    .filter(
      (t): t is { id: string; mode: string; status: string; max_seats: number; entry_amount: number } =>
        !!t && t.mode === "online" && t.status !== "finished" && t.status !== "cancelled",
    );

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
        <CreateOnlineTableForm allowPaid={!isGuest} balance={balance} />
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
                <span className="mono-data text-sm">
                  {t.id} {t.entry_amount > 0 && <span className="text-ink-dim">— {t.entry_amount} moedas</span>}
                </span>
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
