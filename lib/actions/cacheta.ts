"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validarBatida } from "@/lib/cacheta/rules";
import { cardsEqual, type Card } from "@/lib/cacheta/cards";

export type ActionState = { error: string } | { success: string } | null;

// "Bater": lê a mão do jogador via o cliente por-requisição (RLS garante que
// só a própria mão volta — cacheta_hands_select_own), valida a combinação
// proposta com o motor de regras puro, e só então usa createServiceClient()
// para gravar o resultado — mesmo idioma de "confirma acesso no cliente
// RLS, escreve com service-role" já usado em endBroadcastManually
// (lib/actions/live-broadcasts.ts). Ver contracts/rpcs.md.
export async function baterCombinacao(tableId: string, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();

  const { data: myPlayerId } = await supabase.rpc("current_player_id");
  if (!myPlayerId) return { error: "Faça login para jogar." };

  const { data: seat } = await supabase
    .from("cacheta_table_seats")
    .select("id")
    .eq("table_id", tableId)
    .eq("player_id", myPlayerId)
    .maybeSingle();
  if (!seat) return { error: "Você não tem assento nesta mesa." };

  const { data: table } = await supabase
    .from("cacheta_tables")
    .select("status, turn_seat_id, coringa")
    .eq("id", tableId)
    .single();
  if (!table || table.status !== "playing") return { error: "Esta mesa não está em andamento." };
  if (table.turn_seat_id !== seat.id) return { error: "Não é a sua vez." };

  const { data: handRow } = await supabase
    .from("cacheta_hands")
    .select("cards")
    .eq("seat_id", seat.id)
    .single();
  if (!handRow) return { error: "Mão não encontrada." };

  const hand = handRow.cards as unknown as Card[];
  const selectedRaw = String(formData.get("cards") ?? "[]");
  let selected: Card[];
  try {
    selected = JSON.parse(selectedRaw);
  } catch {
    return { error: "Seleção de cartas inválida." };
  }
  if (!Array.isArray(selected) || selected.length !== 9) {
    return { error: "Selecione exatamente 9 cartas para bater." };
  }

  const remaining = [...hand];
  for (const card of selected) {
    const idx = remaining.findIndex((c) => cardsEqual(c, card));
    if (idx === -1) return { error: "Uma das cartas selecionadas não está na sua mão." };
    remaining.splice(idx, 1);
  }
  if (remaining.length > 1) {
    return { error: "Sobraram cartas demais — selecione 9 cartas da sua mão de 9 ou 10." };
  }

  const coringa = table.coringa as unknown as Card;
  const result = validarBatida(selected, coringa);
  if (!result.valid) {
    return { error: result.reason };
  }

  const service = createServiceClient();

  const { data: freshTable } = await service.from("cacheta_tables").select("discard_pile").eq("id", tableId).single();
  const discardPile = [...((freshTable?.discard_pile as unknown as Card[]) ?? []), ...remaining];

  await service.from("cacheta_table_seats").update({ status: "batido" }).eq("id", seat.id);
  await service
    .from("cacheta_tables")
    .update({ status: "finished", winner_seat_id: seat.id, discard_pile: discardPile as never, turn_seat_id: null, turn_deadline_at: null })
    .eq("id", tableId);
  await service.from("cacheta_moves").insert({ table_id: tableId, seat_id: seat.id, type: "bater" });

  // Registro de pontuação/ranking do jogo (cacheta_game_results) é US3 —
  // ver T030 em specs/001-cacheta-jogo-online/tasks.md; esta função é
  // estendida lá, não reescrita, quando a tabela existir.

  revalidatePath(`/jogar/${tableId}`);
  return { success: "Você bateu! Partida encerrada." };
}
