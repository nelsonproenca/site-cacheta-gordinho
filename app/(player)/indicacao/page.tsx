import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card as UiCard } from "@/components/ui/card";
import { SetReferralCodeForm } from "@/components/referral/set-referral-code-form";

// specs/002-moedas-pagamento-indicacao, US3 — código/link de indicação,
// lista de indicados, e comissão acumulada (soma de wallet_movements com
// reason = 'referral_commission'). Convidado nunca chega aqui (middleware).
export default async function IndicacaoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar?next=/indicacao");

  const { data: myPlayerId } = await supabase.rpc("current_player_id");
  if (!myPlayerId) redirect("/entrar?next=/indicacao");

  const [{ data: myCode }, { data: referred }, { data: commissions }] = await Promise.all([
    supabase.from("referral_codes").select("code").eq("player_id", myPlayerId).maybeSingle(),
    supabase
      .from("referral_links")
      .select("created_at, players!referral_links_referred_player_id_fkey(display_name, tiktok_handle)")
      .eq("referrer_player_id", myPlayerId)
      .order("created_at", { ascending: false }),
    supabase.from("wallet_movements").select("amount").eq("player_id", myPlayerId).eq("reason", "referral_commission"),
  ]);

  const totalCommission = (commissions ?? []).reduce((sum, m) => sum + m.amount, 0);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const link = myCode ? `${siteUrl}/?ref=${myCode.code}` : null;

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8 max-w-2xl mx-auto w-full">
      <div>
        <p className="caption">Cacheta Gordinho</p>
        <h1 className="font-display text-2xl italic font-extrabold uppercase">Indicação</h1>
        <p className="text-ink-dim text-sm mt-1">
          Indique jogadores e ganhe comissão sobre a taxa da casa das mesas pagas que eles jogarem.
        </p>
      </div>

      <UiCard className="flex flex-col gap-4">
        {myCode ? (
          <div>
            <p className="text-ink-dim text-sm">Seu código</p>
            <p className="font-display text-2xl font-extrabold">{myCode.code}</p>
            {link && (
              <p className="mono-data text-sm mt-2 break-all">
                Seu link: <a href={link}>{link}</a>
              </p>
            )}
          </div>
        ) : (
          <SetReferralCodeForm />
        )}
      </UiCard>

      <UiCard className="flex flex-col items-center gap-1 py-6">
        <span className="text-ink-dim text-sm">Comissão acumulada</span>
        <span className="font-display text-3xl font-extrabold">{totalCommission} moedas</span>
      </UiCard>

      <UiCard className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold uppercase">Indicados</h2>
        {(referred ?? []).length === 0 ? (
          <p className="text-ink-dim text-sm">Ninguém usou seu código ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {(referred ?? []).map((r, i) => (
              <li key={i} className="flex items-center justify-between">
                <span>
                  {r.players?.display_name ?? "—"}{" "}
                  <span className="text-ink-dim mono-data">@{r.players?.tiktok_handle}</span>
                </span>
                <span className="text-ink-dim">{new Date(r.created_at).toLocaleDateString("pt-BR")}</span>
              </li>
            ))}
          </ul>
        )}
      </UiCard>
    </main>
  );
}
