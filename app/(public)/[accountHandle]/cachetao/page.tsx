import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncCachetaoEventStatus, CACHETAO_STATUS_LABEL, CACHETAO_CLOSE_RULE_LABEL } from "@/lib/cachetao";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClosingCountdown } from "@/components/closing-countdown";
import { CachetaoRegisterModal } from "./cachetao-register-modal";

// Safety-net revalidation for public pages under live load, same as the
// ranking page — not the primary invalidation path, just an upper bound on
// staleness (prd.md §11).
export const revalidate = 20;

export default async function PublicCachetaoPage({
  params,
}: {
  params: Promise<{ accountHandle: string }>;
}) {
  const { accountHandle } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("tiktok_accounts")
    .select("id, handle, display_name")
    .eq("handle", accountHandle.toLowerCase())
    .maybeSingle();

  if (!account) notFound();

  const { data: event } = await supabase
    .from("cachetao_events")
    .select("*")
    .eq("tiktok_account_id", account.id)
    .neq("status", "finished")
    .order("event_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  const synced = event ? await syncCachetaoEventStatus(supabase, event) : null;

  const { data: registrationRows } = synced
    ? await supabase
        .from("cachetao_registrations")
        .select("registration_type, queue_position, status, players(display_name, tiktok_handle)")
        .eq("cachetao_event_id", synced.id)
        .neq("status", "cancelled")
    : { data: null };

  const registrations = registrationRows ?? [];
  const principals = registrations.filter((r) => r.registration_type === "principal");
  const substitutes = registrations
    .filter((r) => r.registration_type === "substitute")
    .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));

  const isOpen = synced?.status === "registrations_open";
  const missingPrincipals = synced ? Math.max((synced.max_principals ?? 0) - principals.length, 0) : 0;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8 max-w-2xl mx-auto w-full">
      <div>
        <p className="caption">@{account.handle}</p>
        <h1 className="font-display text-4xl italic font-extrabold uppercase">Cachetão</h1>
      </div>

      {!synced && <p className="text-ink-dim">Nenhum Cachetão agendado no momento.</p>}

      {synced && (
        <>
          <Card className="flex flex-row items-center justify-between">
            <div>
              <div className="font-display italic font-bold text-xl uppercase">
                {formatDate(synced.event_date)} · {CACHETAO_CLOSE_RULE_LABEL[synced.close_rule] ?? synced.close_rule}
              </div>
              <p className="text-ink-dim text-sm">
                Inscrições: {formatDateTime(synced.registration_opens_at)}
                {synced.registration_closes_at ? ` – ${formatDateTime(synced.registration_closes_at)}` : ""}
              </p>
            </div>
            <Badge variant={isOpen ? "green" : "neutral"}>{CACHETAO_STATUS_LABEL[synced.status] ?? synced.status}</Badge>
          </Card>

          {/* Big, hard-to-miss readout so players can tell at a glance
              whether registration is still open, without reading the whole
              card above — a countdown for time-ruled events, remaining
              slots for count-ruled ones. */}
          {isOpen && (
            <Card className="card-stat text-center">
              <div className="card-label">
                {synced.close_rule === "count" ? "Vagas restantes" : "Fecha em"}
              </div>
              {synced.close_rule === "count" ? (
                <div className="card-value">{missingPrincipals}</div>
              ) : (
                synced.registration_closes_at && (
                  <ClosingCountdown closesAt={synced.registration_closes_at} size="lg" />
                )
              )}
            </Card>
          )}

          {isOpen && (
            <div className="flex justify-center">
              <CachetaoRegisterModal eventId={synced.id} />
            </div>
          )}

          {synced.status === "scheduled" && (
            <p className="text-ink-dim text-sm">
              Inscrições abrem em {formatDateTime(synced.registration_opens_at)}.
            </p>
          )}

          <Card>
            <h2 className="font-display italic font-bold text-xl uppercase mb-4">
              Principais ({principals.length}
              {synced.max_principals ? `/${synced.max_principals}` : ""})
            </h2>
            <div className="flex flex-wrap gap-2">
              {principals.map((r, i) => (
                <Badge key={i} variant="green">
                  {r.players?.display_name} (@{r.players?.tiktok_handle})
                </Badge>
              ))}
              {principals.length === 0 && <p className="text-ink-dim text-sm">Ninguém inscrito ainda.</p>}
            </div>
          </Card>

          {substitutes.length > 0 && (
            <Card>
              <h2 className="font-display italic font-bold text-xl uppercase mb-4">Fila de suplentes</h2>
              <div className="flex flex-col gap-2">
                {substitutes.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="mono-data">{r.queue_position}º</span>
                    <Badge variant="yellow">
                      {r.players?.display_name} (@{r.players?.tiktok_handle})
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </main>
  );
}
