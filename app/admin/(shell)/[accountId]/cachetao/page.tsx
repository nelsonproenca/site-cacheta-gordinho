import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  syncCachetaoEventStatus,
  CACHETAO_STATUS_LABEL,
  CACHETAO_STATUS_VARIANT,
  CACHETAO_CLOSE_RULE_LABEL,
} from "@/lib/cachetao";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateEventForm } from "./create-event-form";
import { ClosingCountdown } from "@/components/closing-countdown";

export default async function CachetaoPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("cachetao_events")
    .select("*")
    .eq("tiktok_account_id", accountId)
    .order("event_date", { ascending: false });

  // Lazily flip status the same way closeStaleLiveSessions does for lives —
  // no cron in this stack, so a stale "scheduled"/"registrations_open" row
  // only catches up to the wall clock when this page is loaded.
  const events = await Promise.all(
    (rows ?? []).map((event) =>
      event.status === "scheduled" || event.status === "registrations_open"
        ? syncCachetaoEventStatus(supabase, event)
        : event,
    ),
  );

  // Confirmed principal counts per event, for the "por quantidade" case's
  // "faltam N jogadores" readout — one query for every event on the page
  // instead of one per card.
  const eventIds = events.map((e) => e.id);
  const { data: principalRows } = eventIds.length
    ? await supabase
        .from("cachetao_registrations")
        .select("cachetao_event_id")
        .in("cachetao_event_id", eventIds)
        .eq("registration_type", "principal")
        .neq("status", "cancelled")
    : { data: [] };

  const principalCounts = new Map<string, number>();
  for (const r of principalRows ?? []) {
    principalCounts.set(r.cachetao_event_id, (principalCounts.get(r.cachetao_event_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="font-display italic font-bold text-xl uppercase mb-4">Novo Cachetão</h2>
        <CreateEventForm accountId={accountId} />
      </Card>

      <div className="flex flex-col gap-3">
        {events.map((event) => {
          const confirmedPrincipals = principalCounts.get(event.id) ?? 0;
          const missingPrincipals = Math.max((event.max_principals ?? 0) - confirmedPrincipals, 0);

          const thirdLine =
            event.status === "registrations_open" &&
            (event.close_rule === "count" ? (
              <>Faltam {missingPrincipals} jogadores para encerrar as inscrições</>
            ) : (
              event.registration_closes_at && <ClosingCountdown closesAt={event.registration_closes_at} />
            ));

          return (
            <Link key={event.id} href={`/admin/${accountId}/cachetao/${event.id}`}>
              <Card className="flex flex-row items-center justify-between">
                <div>
                  <div className="font-display italic font-bold text-lg uppercase">
                    {formatDate(event.event_date)} · {CACHETAO_CLOSE_RULE_LABEL[event.close_rule] ?? event.close_rule}
                  </div>
                  <div className="text-ink-dim text-sm">
                    {event.close_rule === "count" ? (
                      <>
                        Vagas principais: {confirmedPrincipals}/{event.max_principals ?? "?"}
                      </>
                    ) : (
                      <>
                        Inscrições: {formatDateTime(event.registration_opens_at)}
                        {event.registration_closes_at ? ` – ${formatDateTime(event.registration_closes_at)}` : ""}
                      </>
                    )}
                  </div>
                  {thirdLine && <div className="text-sm mt-1">{thirdLine}</div>}
                </div>
                <Badge variant={CACHETAO_STATUS_VARIANT[event.status] ?? "neutral"}>
                  {CACHETAO_STATUS_LABEL[event.status] ?? event.status}
                </Badge>
              </Card>
            </Link>
          );
        })}
        {events.length === 0 && <p className="text-ink-dim">Nenhum Cachetão criado ainda.</p>}
      </div>
    </div>
  );
}
