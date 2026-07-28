import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type CachetaoEvent = Database["public"]["Tables"]["cachetao_events"]["Row"];

// Shared pt-BR labels/badge colors for cachetao_events.status and .close_rule
// — was copy-pasted across the admin list, admin detail, and public pages;
// kept here as the one place that knows every status/rule string.
export const CACHETAO_STATUS_LABEL: Record<string, string> = {
  scheduled: "Agendado",
  registrations_open: "Inscrições abertas",
  registrations_closed: "Inscrições encerradas",
  in_progress: "Em andamento",
  finished: "Finalizado",
};

export const CACHETAO_STATUS_VARIANT: Record<string, "neutral" | "green" | "yellow" | "purple"> = {
  scheduled: "neutral",
  registrations_open: "green",
  registrations_closed: "yellow",
  in_progress: "purple",
  finished: "neutral",
};

export const CACHETAO_CLOSE_RULE_LABEL: Record<string, string> = {
  time: "Por tempo",
  count: "Por quantidade",
  both: "Tempo ou quantidade",
};

// Registration windows close lazily, same pattern as closeStaleLiveSessions:
// there's no cron/scheduler in this stack, so a "scheduled" event that's
// reached registration_opens_at, or an open one past registration_closes_at,
// only flips status the next time someone touches it (registration attempt,
// admin page load). "Por quantidade" closes eagerly instead, right when the
// capacity-filling registration is inserted (see registerPlayerForEvent) —
// there's a concrete write to hang that off of, so there's nothing to poll.
export async function syncCachetaoEventStatus(
  supabase: SupabaseClient<Database>,
  event: CachetaoEvent,
): Promise<CachetaoEvent> {
  const now = new Date();
  let nextStatus = event.status;

  if (nextStatus === "scheduled" && new Date(event.registration_opens_at) <= now) {
    nextStatus = "registrations_open";
  }
  if (
    (nextStatus === "scheduled" || nextStatus === "registrations_open") &&
    (event.close_rule === "time" || event.close_rule === "both") &&
    event.registration_closes_at &&
    new Date(event.registration_closes_at) <= now
  ) {
    nextStatus = "registrations_closed";
  }

  if (nextStatus === event.status) return event;

  const { data } = await supabase
    .from("cachetao_events")
    .update({ status: nextStatus })
    .eq("id", event.id)
    .eq("status", event.status)
    .select()
    .single();

  return data ?? event;
}

export type RegistrationOutcome = {
  registrationType: "principal" | "substitute";
  queuePosition: number | null;
};

// Shared by self-registration (public, no player auth) and admin manual add
// — both need identical capacity/FIFO math, so it lives in one place instead
// of being duplicated against two different Supabase clients. Caller must
// pass an already status-synced event (see syncCachetaoEventStatus).
//
// Concurrency note: this reads counts, then inserts, as separate statements
// — two truly simultaneous registrations landing on the exact last slot
// could both be accepted as principal. Acceptable for MVP scale (admin adds
// are one-at-a-time; self-registration spread across a week essentially
// never collides to the millisecond) — revisit with a serializable RPC if it
// ever actually happens.
export async function registerPlayerForEvent(
  supabase: SupabaseClient<Database>,
  event: CachetaoEvent,
  playerId: string,
): Promise<{ error: string } | { data: RegistrationOutcome }> {
  const now = new Date();

  if (event.status === "registrations_closed" || event.status === "in_progress" || event.status === "finished") {
    return { error: "Inscrições encerradas para este Cachetão." };
  }
  if (new Date(event.registration_opens_at) > now) {
    return { error: "Inscrições ainda não abriram." };
  }

  const countRegistrations = async (type: "principal" | "substitute") => {
    const { count } = await supabase
      .from("cachetao_registrations")
      .select("id", { count: "exact", head: true })
      .eq("cachetao_event_id", event.id)
      .eq("registration_type", type)
      .neq("status", "cancelled");
    return count ?? 0;
  };

  // "Por tempo" (close_rule === 'time') has no principal cap at all — every
  // registration is a principal, and the substitute queue never applies.
  const principalsCapped = event.close_rule !== "time" && event.max_principals !== null;
  const principalsCount = principalsCapped ? await countRegistrations("principal") : 0;
  const principalsFull = principalsCapped && principalsCount >= event.max_principals!;

  const registrationType: "principal" | "substitute" = principalsFull ? "substitute" : "principal";
  let queuePosition: number | null = null;

  if (registrationType === "substitute") {
    if (event.max_substitutes !== null) {
      const substitutesCount = await countRegistrations("substitute");
      if (substitutesCount >= event.max_substitutes) {
        return { error: "Não há mais vagas, nem de suplente, para este Cachetão." };
      }
    }
    const { data: lastInQueue } = await supabase
      .from("cachetao_registrations")
      .select("queue_position")
      .eq("cachetao_event_id", event.id)
      .eq("registration_type", "substitute")
      .neq("status", "cancelled")
      .order("queue_position", { ascending: false })
      .limit(1)
      .maybeSingle();
    queuePosition = (lastInQueue?.queue_position ?? 0) + 1;
  }

  const { error: insertError } = await supabase.from("cachetao_registrations").insert({
    cachetao_event_id: event.id,
    player_id: playerId,
    registration_type: registrationType,
    queue_position: queuePosition,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { error: "Este jogador já está inscrito neste Cachetão." };
    }
    return { error: insertError.message };
  }

  // Only close the event once there is truly no capacity left of *any* kind
  // — principals full AND (if capped) substitutes full too. Reaching
  // max_principals alone must NOT close registration: prd.md §4.5 has
  // players beyond that limit keep signing up as substitutes (up to
  // max_substitutes). An event with an uncapped substitute queue
  // (max_substitutes null) is therefore never auto-closed by count — only by
  // the time deadline (syncCachetaoEventStatus) or an admin.
  if (principalsCapped) {
    const [finalPrincipals, finalSubstitutes] = await Promise.all([
      countRegistrations("principal"),
      countRegistrations("substitute"),
    ]);
    const principalsFullNow = finalPrincipals >= event.max_principals!;
    const substitutesFullNow = event.max_substitutes !== null && finalSubstitutes >= event.max_substitutes;
    if (principalsFullNow && substitutesFullNow) {
      await supabase.from("cachetao_events").update({ status: "registrations_closed" }).eq("id", event.id);
    }
  }

  return { data: { registrationType, queuePosition } };
}
