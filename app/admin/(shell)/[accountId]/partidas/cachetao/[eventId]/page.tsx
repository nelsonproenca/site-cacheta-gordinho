import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncCachetaoEventStatus, CACHETAO_STATUS_LABEL, CACHETAO_STATUS_VARIANT } from "@/lib/cachetao";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PartidasSection } from "../../partidas-section";

export default async function PartidasCachetaoPage({
  params,
}: {
  params: Promise<{ accountId: string; eventId: string }>;
}) {
  const { accountId, eventId } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase.from("cachetao_events").select("*").eq("id", eventId).maybeSingle();
  if (!event) notFound();

  const synced =
    event.status === "scheduled" || event.status === "registrations_open"
      ? await syncCachetaoEventStatus(supabase, event)
      : event;

  const sourceOpen = synced.status !== "scheduled" && synced.status !== "registrations_open";

  const [{ data: registrationRows }, { data: scoringRules }, { data: matchRows }] = await Promise.all([
    supabase
      .from("cachetao_registrations")
      .select("players(id, display_name, tiktok_handle)")
      .eq("cachetao_event_id", eventId)
      .in("status", ["confirmed", "called_up"]),
    supabase
      .from("scoring_rules")
      .select("id, name, points")
      .eq("is_active", true)
      .order("points", { ascending: false }),
    supabase
      .from("matches")
      .select(
        `id,
         player_a:players!matches_player_a_id_fkey(id, display_name, tiktok_handle),
         player_b:players!matches_player_b_id_fkey(id, display_name, tiktok_handle),
         match_results(id, player_id, scoring_rule_id, points_awarded, scoring_rules(name))`,
      )
      .eq("cachetao_event_id", eventId)
      .not("player_a_id", "is", null),
  ]);

  const pool = (registrationRows ?? [])
    .map((row) => row.players)
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const matches = (matchRows ?? [])
    .filter((m) => m.player_a && m.player_b)
    .map((m) => ({
      id: m.id,
      playerA: m.player_a!,
      playerB: m.player_b!,
      resultA: m.match_results.find((r) => r.player_id === m.player_a!.id) ?? null,
      resultB: m.match_results.find((r) => r.player_id === m.player_b!.id) ?? null,
    }));

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-row items-center justify-between">
        <span className="mono-data text-lg">{formatDate(synced.event_date)}</span>
        <Badge variant={CACHETAO_STATUS_VARIANT[synced.status] ?? "neutral"}>
          {CACHETAO_STATUS_LABEL[synced.status] ?? synced.status}
        </Badge>
      </Card>

      <PartidasSection
        accountId={accountId}
        sourceType="cachetao"
        sourceId={eventId}
        sourceOpen={sourceOpen}
        pool={pool}
        matches={matches}
        scoringRules={scoringRules ?? []}
      />
    </div>
  );
}
