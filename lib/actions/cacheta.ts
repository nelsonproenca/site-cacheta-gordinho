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
export async function createOnlineTable(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const entryAmountRaw = String(formData.get("entry_amount") ?? "").trim();
  const entryAmount = entryAmountRaw ? Number(entryAmountRaw) : 0;
  if (Number.isNaN(entryAmount) || entryAmount < 0) {
    return { error: "Valor de entrada inválido." };
  }

  const supabase = await createClient();
  const { data: tableId, error } = await supabase.rpc("create_cacheta_table", {
    p_mode: "online",
    p_max_seats: 4,
    p_entry_amount: entryAmount,
  });
  if (error || !tableId) {
    return { error: error?.message ?? "Não foi possível criar a mesa." };
  }
  redirect(`/jogar/${tableId}`);
}

// specs/002-moedas-pagamento-indicacao, US2 — só o criador, só enquanto
// 'waiting' (cancel_cacheta_table já valida isso no banco); estorna a
// entrada de cada assento humano sentado.
export async function cancelPaidTable(tableId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_cacheta_table", { p_table_id: tableId });
  if (error) {
    redirect(`/jogar/${tableId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/jogar/online");
  redirect("/jogar/online");
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
    .select("status, turn_seat_id, coringa, entry_amount")
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
  if (!Array.isArray(selected) || (selected.length !== 9 && selected.length !== 10)) {
    return { error: "Selecione 9 cartas (com descarte) ou as 10 cartas da mão (bater limpo, sem descartar)." };
  }

  const remaining = [...hand];
  for (const card of selected) {
    const idx = remaining.findIndex((c) => cardsEqual(c, card));
    if (idx === -1) return { error: "Uma das cartas selecionadas não está na sua mão." };
    remaining.splice(idx, 1);
  }
  if (remaining.length > 1) {
    return { error: "Sobraram cartas demais — selecione 9 ou 10 cartas da sua mão." };
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
  // nunca derivada de scoring_rules: 1 ponto para batida normal, 2 para
  // "bater com 10"/"bater limpo" — mesma proporção da regra oficial, em que
  // bater limpo tira o dobro de pontos de vida dos adversários.
  const combType = combinationType(selected.length);
  const points = combType === "bater_limpo" ? 2 : 1;
  await service.from("cacheta_game_results").insert({
    table_id: tableId,
    winner_player_id: seat.player_id,
    combination_type: combType,
    points_awarded: points,
  });

  // specs/002-moedas-pagamento-indicacao, US2/US3 — payout do pote (menos
  // taxa da casa) e, se aplicável, comissão de indicação sobre essa taxa.
  // Único ponto da aplicação que resolve "quando uma mesa paga termina"
  // (research.md §6) — não duplicado em nenhuma outra camada.
  if (table.entry_amount > 0 && seat.player_id) {
    const { count: paidSeats } = await service
      .from("cacheta_table_seats")
      .select("id", { count: "exact", head: true })
      .eq("table_id", tableId)
      .not("player_id", "is", null);
    const pot = table.entry_amount * (paidSeats ?? 0);

    const { data: settings } = await service
      .from("platform_settings")
      .select("house_rake_percent, referral_commission_percent")
      .single();
    const rakePercent = settings?.house_rake_percent ?? 10;
    const commissionPercent = settings?.referral_commission_percent ?? 25;

    const rake = Math.round(pot * (rakePercent / 100));
    const payout = pot - rake;

    if (payout > 0) {
      await service.rpc("wallet_credit", {
        p_player_id: seat.player_id,
        p_amount: payout,
        p_reason: "table_payout",
        p_reference_table_id: tableId,
      });
    }
    if (rake > 0) {
      await service.rpc("wallet_credit", {
        // generated RPC param types don't model SQL nullability — this param
        // genuinely accepts null (house_rake has no owning player, see
        // 20261105000057).
        p_player_id: null as unknown as string,
        p_amount: rake,
        p_reason: "house_rake",
        p_reference_table_id: tableId,
      });

      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const { data: referralLink } = await service
        .from("referral_links")
        .select("referrer_player_id, created_at")
        .eq("referred_player_id", seat.player_id)
        .maybeSingle();

      if (referralLink && new Date(referralLink.created_at) >= twelveMonthsAgo) {
        const commission = Math.round(rake * (commissionPercent / 100));
        if (commission > 0) {
          await service.rpc("wallet_credit", {
            p_player_id: referralLink.referrer_player_id,
            p_amount: commission,
            p_reason: "referral_commission",
            p_reference_table_id: tableId,
          });
        }
      }
    }
  }

  revalidatePath(`/jogar/${tableId}`);
  revalidatePath("/carteira");
  revalidatePath("/indicacao");
  revalidatePath("/jogar/ranking");
  return { success: "Você bateu! Partida encerrada." };
}
