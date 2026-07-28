import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardGrid } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPeriodRanking, getRanking } from "@/lib/scoring/get-ranking";
import { syncCachetaoEventStatus } from "@/lib/cachetao";
import { ClosingCountdown } from "@/components/closing-countdown";

// Public landing page — the primary audience is players (no login: pick a
// streamer, land on their public ranking/Cachetão/cadastro pages, see
// [accountHandle]/layout.tsx for that nav). Admin access ("Área Restrita")
// lives in the global masthead (app/layout.tsx), not this page.
export default async function Home() {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("tiktok_accounts")
    .select("id, handle, display_name")
    .eq("is_active", true)
    .order("display_name");

  const accountList = accounts ?? [];
  // Both hero preview cards feature the same account (the first active one,
  // alphabetically) so they read as one coherent "here's what you'll see"
  // teaser rather than two unrelated streamers. Each is only rendered if
  // there's real data behind it — no fabricated numbers.
  const featured = accountList[0] ?? null;

  let leader: { handle: string; points: number; periodLabel: string; sharePct: number } | null = null;
  if (featured) {
    const { data: openPeriod } = await supabase
      .from("score_periods")
      .select("id, type")
      .eq("tiktok_account_id", featured.id)
      .eq("status", "open")
      .maybeSingle();

    const ranking = openPeriod
      ? await getPeriodRanking(supabase, openPeriod.id)
      : await getRanking(supabase, featured.id);

    const top = ranking[0];
    if (top) {
      const totalPositive = ranking.reduce((sum, entry) => sum + Math.max(entry.totalPoints, 0), 0);
      leader = {
        handle: top.tiktokHandle,
        points: top.totalPoints,
        periodLabel: openPeriod ? (openPeriod.type === "week" ? "Ranking semanal" : "Ranking da temporada") : "Ranking geral",
        sharePct: totalPositive > 0 ? Math.round((Math.max(top.totalPoints, 0) / totalPositive) * 100) : 0,
      };
    }
  }

  let cachetao: {
    closeRule: string;
    registrationClosesAt: string | null;
    missingPrincipals: number;
  } | null = null;
  if (featured) {
    const { data: event } = await supabase
      .from("cachetao_events")
      .select("*")
      .eq("tiktok_account_id", featured.id)
      .neq("status", "finished")
      .order("event_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    const synced = event ? await syncCachetaoEventStatus(supabase, event) : null;

    if (synced?.status === "registrations_open") {
      let missingPrincipals = 0;
      if (synced.close_rule === "count") {
        const { count } = await supabase
          .from("cachetao_registrations")
          .select("id", { count: "exact", head: true })
          .eq("cachetao_event_id", synced.id)
          .eq("registration_type", "principal")
          .neq("status", "cancelled");
        missingPrincipals = Math.max((synced.max_principals ?? 0) - (count ?? 0), 0);
      }
      cachetao = {
        closeRule: synced.close_rule,
        registrationClosesAt: synced.registration_closes_at,
        missingPrincipals,
      };
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <div className="hero">
        <div className="hero-stripe" />

        {/* Decorative feature previews, framing the headline like real
            product cards instead of generic hero art — real data from the
            first active account, hidden entirely (not faked) when there's
            nothing real to show. Hidden below `xl` (1280px) so they only
            show once the centered, width-capped headline (see h1 below) has
            enough side clearance to not collide with them. */}
        {leader && featured && (
          <Link
            href={`/${featured.handle}/ranking`}
            className="hidden xl:block absolute top-10 right-6 w-52 rotate-6 drop-shadow-2xl transition-transform hover:rotate-3 hover:scale-[1.03]"
          >
            <Card className="card-driver">
              <div className="driver-top">
                <div className="driver-number">01</div>
                <div className="position-tag">P1</div>
              </div>
              <div>
                <div className="driver-name">@{leader.handle}</div>
                <div className="driver-team">{leader.periodLabel}</div>
              </div>
              <div className="driver-bar-row">
                <span>Pontos</span>
                <div className="driver-bar">
                  <span style={{ width: `${leader.sharePct}%` }} />
                </div>
                <span>{leader.points}</span>
              </div>
            </Card>
          </Link>
        )}
        {cachetao && featured && (
          <Link
            href={`/${featured.handle}/cachetao`}
            className="hidden xl:flex absolute bottom-10 left-6 w-48 -rotate-6 drop-shadow-2xl transition-transform hover:-rotate-3 hover:scale-[1.03]"
          >
            <Card className="card-stat text-center w-full flex flex-col items-center gap-2">
              <Badge variant="green">Inscrições abertas</Badge>
              {cachetao.closeRule === "count" ? (
                <>
                  <div className="card-label">Vagas restantes</div>
                  <div className="card-value">{cachetao.missingPrincipals}</div>
                </>
              ) : (
                <>
                  <div className="card-label">Cachetão fecha em</div>
                  {cachetao.registrationClosesAt && (
                    <ClosingCountdown closesAt={cachetao.registrationClosesAt} size="lg" />
                  )}
                </>
              )}
            </Card>
          </Link>
        )}

        <div className="relative flex flex-col items-center gap-7 px-6 sm:px-16 py-20 sm:py-28 text-center">
          <div className="hero-kicker flex items-center gap-2">
            <span className="kicker-dot" />
            <span className="caption">Plataforma de Cacheta ao vivo</span>
          </div>

          <h1 className="font-display italic font-black uppercase text-ink leading-[0.95] text-[clamp(40px,7vw,80px)] max-w-4xl">
            Cachetão do
            <br />
            <span className="text-red">Gordinho do Baralho</span>
          </h1>

          <p className="max-w-md text-ink-dim text-lg">
            Acompanhe o ranking, inscreva-se no Cachetão e veja os resultados das lives — sem
            precisar de cadastro pra navegar.
          </p>

          <div className="lights-rig is-sequencing" aria-hidden="true">
            <div className="light-bulb" />
            <div className="light-bulb" />
            <div className="light-bulb" />
            <div className="light-bulb" />
            <div className="light-bulb" />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 px-6 sm:px-16 py-16">
        <h2 className="font-display italic font-bold text-xl uppercase text-ink-dim text-center">
          Escolha um streamer
        </h2>
        {accountList.length > 0 ? (
          <div className="w-full max-w-3xl">
            <CardGrid>
              {accountList.map((account) => (
                <Link key={account.handle} href={`/${account.handle}/ranking`}>
                  <Card>
                    <span className="font-display italic font-bold text-lg">@{account.handle}</span>
                    <p className="text-ink-dim text-sm">{account.display_name}</p>
                  </Card>
                </Link>
              ))}
            </CardGrid>
          </div>
        ) : (
          <p className="text-ink-dim text-center">Nenhuma conta ativa no momento.</p>
        )}
      </div>
    </main>
  );
}
