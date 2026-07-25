import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  syncCaxetaoEventStatus,
  CAXETAO_STATUS_LABEL,
  CAXETAO_STATUS_VARIANT,
  CAXETAO_CLOSE_RULE_LABEL,
} from "@/lib/caxetao";
import { cancelRegistration, markNoShow, startCaxetaoEvent, finishCaxetaoEvent } from "@/lib/actions/caxetao";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClosingCountdown } from "@/components/closing-countdown";
import { RegisterPlayerModal } from "./register-player-modal";

function registrationBadge(status: string, registrationType: string) {
  if (status === "cancelled") return <Badge variant="red">Cancelado</Badge>;
  if (status === "no_show") return <Badge variant="red">Ausente</Badge>;
  if (status === "called_up") return <Badge variant="purple">Chamado</Badge>;
  return registrationType === "substitute" ? (
    <Badge variant="yellow">Suplente</Badge>
  ) : (
    <Badge variant="green">Confirmado</Badge>
  );
}

export default async function CaxetaoEventPage({
  params,
}: {
  params: Promise<{ accountId: string; eventId: string }>;
}) {
  const { accountId, eventId } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase.from("caxetao_events").select("*").eq("id", eventId).maybeSingle();
  if (!event) notFound();

  const synced =
    event.status === "scheduled" || event.status === "registrations_open"
      ? await syncCaxetaoEventStatus(supabase, event)
      : event;

  const { data: registrationRows } = await supabase
    .from("caxetao_registrations")
    .select("id, registration_type, queue_position, status, players(display_name, tiktok_handle)")
    .eq("caxetao_event_id", eventId)
    .order("registered_at", { ascending: true });

  const registrations = registrationRows ?? [];
  const principals = registrations.filter((r) => r.registration_type === "principal");
  const substitutes = registrations
    .filter((r) => r.registration_type === "substitute")
    .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));

  const activePrincipals = principals.filter((r) => r.status !== "cancelled" && r.status !== "no_show").length;
  const activeSubstitutes = substitutes.filter((r) => r.status !== "cancelled" && r.status !== "no_show").length;
  const missingPrincipals = Math.max((synced.max_principals ?? 0) - activePrincipals, 0);

  const thirdLine =
    synced.status === "registrations_open" &&
    (synced.close_rule === "count" ? (
      <>Faltam {missingPrincipals} jogadores para encerrar as inscrições</>
    ) : (
      synced.registration_closes_at && <ClosingCountdown closesAt={synced.registration_closes_at} />
    ));

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-row items-center justify-between">
        <div>
          <div className="font-display italic font-bold text-xl uppercase">
            {formatDate(synced.event_date)} · {CAXETAO_CLOSE_RULE_LABEL[synced.close_rule] ?? synced.close_rule}
          </div>
          <div className="text-ink-dim text-sm">
            {synced.close_rule === "count" ? (
              <>
                {activePrincipals}/{synced.max_principals ?? "?"} principais
                {synced.max_substitutes ? ` · ${activeSubstitutes}/${synced.max_substitutes} suplentes` : ""}
              </>
            ) : (
              <>
                Inscrições: {formatDateTime(synced.registration_opens_at)}
                {synced.registration_closes_at ? ` – ${formatDateTime(synced.registration_closes_at)}` : ""}
              </>
            )}
          </div>
          {thirdLine && <div className="text-sm mt-1">{thirdLine}</div>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            <Badge variant={CAXETAO_STATUS_VARIANT[synced.status] ?? "neutral"}>
              {CAXETAO_STATUS_LABEL[synced.status] ?? synced.status}
            </Badge>
            {synced.status !== "scheduled" && synced.status !== "registrations_open" && (
              <Link className="btn btn-outline btn-sm" href={`/admin/${accountId}/partidas/caxetao/${eventId}`}>
                Partidas
              </Link>
            )}
            {synced.status === "registrations_closed" && (
              <form action={startCaxetaoEvent}>
                <input type="hidden" name="event_id" value={eventId} />
                <input type="hidden" name="tiktok_account_id" value={accountId} />
                <Button type="submit" variant="outline" size="sm">
                  Iniciar evento
                </Button>
              </form>
            )}
            {synced.status === "in_progress" && (
              <form action={finishCaxetaoEvent}>
                <input type="hidden" name="event_id" value={eventId} />
                <input type="hidden" name="tiktok_account_id" value={accountId} />
                <Button type="submit" variant="outline" size="sm">
                  Finalizar evento
                </Button>
              </form>
            )}
          </div>
          {synced.status !== "finished" && <RegisterPlayerModal eventId={eventId} accountId={accountId} />}
        </div>
      </Card>

      <Card>
        <h2 className="font-display italic font-bold text-xl uppercase mb-4">Principais ({principals.length})</h2>
        <div className="flex flex-col gap-2">
          {principals.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3">
              <span>
                {r.players?.display_name} <span className="text-ink-dim">@{r.players?.tiktok_handle}</span>
              </span>
              <div className="flex items-center gap-2">
                {registrationBadge(r.status, r.registration_type)}
                {(r.status === "confirmed" || r.status === "called_up") && (
                  <>
                    <form action={markNoShow}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="event_id" value={eventId} />
                      <input type="hidden" name="tiktok_account_id" value={accountId} />
                      <Button type="submit" variant="outline" size="sm">
                        Ausente
                      </Button>
                    </form>
                    <form action={cancelRegistration}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="event_id" value={eventId} />
                      <input type="hidden" name="tiktok_account_id" value={accountId} />
                      <Button type="submit" variant="outline" size="sm">
                        Cancelar
                      </Button>
                    </form>
                  </>
                )}
              </div>
            </div>
          ))}
          {principals.length === 0 && <p className="text-ink-dim text-sm">Ninguém inscrito ainda.</p>}
        </div>
      </Card>

      {substitutes.length > 0 && (
        <Card>
          <h2 className="font-display italic font-bold text-xl uppercase mb-4">Fila de suplentes</h2>
          <div className="flex flex-col gap-2">
            {substitutes.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <span>
                  <span className="mono-data mr-2">{r.queue_position}º</span>
                  {r.players?.display_name} <span className="text-ink-dim">@{r.players?.tiktok_handle}</span>
                </span>
                <div className="flex items-center gap-2">
                  {registrationBadge(r.status, r.registration_type)}
                  {r.status === "confirmed" && (
                    <form action={cancelRegistration}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="event_id" value={eventId} />
                      <input type="hidden" name="tiktok_account_id" value={accountId} />
                      <Button type="submit" variant="outline" size="sm">
                        Cancelar
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
