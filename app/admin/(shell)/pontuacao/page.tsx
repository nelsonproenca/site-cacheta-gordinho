import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { CreateRuleForm } from "./create-rule-form";
import { RuleCard } from "./rule-card";

export default async function PontuacaoPage() {
  const supabase = await createClient();

  const [{ data: rules }, { data: { user } }] = await Promise.all([
    supabase.from("scoring_rules").select("id, name, points, is_active").order("points", { ascending: false }),
    supabase.auth.getUser(),
  ]);

  const { data: me } = user
    ? await supabase.from("admins").select("is_super_admin").eq("id", user.id).maybeSingle()
    : { data: null };
  const isSuperAdmin = me?.is_super_admin ?? false;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Pontuação</h1>
        <p className="text-ink-dim">Regras de pontuação valem pra toda a plataforma.</p>
      </div>

      {isSuperAdmin ? (
        <Card>
          <h2 className="font-display italic font-bold text-xl uppercase mb-4">Nova regra</h2>
          <CreateRuleForm />
        </Card>
      ) : (
        <p className="text-ink-dim text-sm">Só o Super Admin pode criar ou editar regras de pontuação.</p>
      )}

      <div className="flex flex-col gap-3">
        {(rules ?? []).map((rule) => (
          <RuleCard key={rule.id} rule={rule} isSuperAdmin={isSuperAdmin} />
        ))}
        {(rules ?? []).length === 0 && <p className="text-ink-dim">Nenhuma regra cadastrada.</p>}
      </div>
    </div>
  );
}
