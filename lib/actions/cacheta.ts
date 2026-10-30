"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validarBatida, combinationType } from "@/lib/cacheta/rules";
import { cardsEqual, type Card } from "@/lib/cacheta/cards";

export type ActionState = { error: string } | { success: string } | null;

// Cria uma mesa online e redireciona para ela — mesmo idioma no-arg +
// redirect() de signOutToHome (lib/actions/auth.ts), usada direto como
// `<form action={createOnlineTable}>`. Erros (ex. jogador já tem mesa
// ativa) voltam para o próprio lobby via query string, já que não há como
// devolver um ActionState para um <form action={fn}> sem useActionState.
export async function createOnlineTable(): Promise<void> {
  const supabase = await createClient();
  const { data: tableId, error } = await supabase.rpc("create_cacheta_table", {
    p_mode: "online",
    p_max_seats: 4,
  });
  if (error || !tableId) {
    redirect(`/jogar/online?error=${encodeURIComponent(error?.message ?? "Não foi possível criar a mesa.")}`);
  }
  redirect(`/jogar/${tableId}`);
}

// Entra numa mesa online existente a partir do id informado pelo próprio
// jogador (compartilhado fora da plataforma, ex. link/código) — não há
// listagem pública de mesas abertas de outros jogadores (ver research.md/
// tasks.md T026: "mesas abertas DO JOGADOR", não do sistema todo).
export async function joinOnlineTable(formData: FormData): Promise<void> {
  const tableId = String(formData.get("tableId") ?? "").trim();
  if (!tableId) {
    redirect(`/jogar/online?error=${encodeURIComponent("Informe o código da mesa.")}`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_cacheta_table", { p_table_id: tableId });
  if (error) {
    redirect(`/jogar/online?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`/jogar/${tableId}`);
}

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
    .select("id, player_id")
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

  // Ranking do jogo (US3, cacheta_game_results) — separado por desenho de
  // match_results (ver data-model.md). Pontuação própria deste domínio,
  // nunca derivada de scoring_rules: 1/2/3 pontos para batida normal/
  // quadra/quina, refletindo a dificuldade crescente da combinação.
  const combType = combinationType(result.groups);
  const points = combType === "quina" ? 3 : combType === "quadra" ? 2 : 1;
  await service.from("cacheta_game_results").insert({
    table_id: tableId,
    winner_player_id: seat.player_id,
    combination_type: combType,
    points_awarded: points,
  });

  revalidatePath(`/jogar/${tableId}`);
  revalidatePath("/jogar/ranking");
  return { success: "Você bateu! Partida encerrada." };
}
