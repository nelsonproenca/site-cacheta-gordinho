import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";
import { CreatePackageForm } from "./create-package-form";
import { PackageCard } from "./package-card";

export default async function ConfiguracoesPage() {
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    { data: settings },
    { data: packages },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("platform_settings").select("*").single(),
    supabase.from("coin_packages").select("id, name, price_brl, coin_amount, active").order("sort_order"),
  ]);

  const { data: me } = user
    ? await supabase.from("admins").select("is_super_admin").eq("id", user.id).maybeSingle()
    : { data: null };
  const isSuperAdmin = me?.is_super_admin ?? false;

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Configurações</h1>
        <p className="text-ink-dim text-sm">Só o Super Admin pode ver/editar a taxa da casa, a comissão de indicação e os pacotes de moedas.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Configurações</h1>
        <p className="text-ink-dim">Taxa da casa, comissão de indicação, chave Pix e pacotes de moedas.</p>
      </div>

      {settings && (
        <Card>
          <h2 className="font-display italic font-bold text-xl uppercase mb-4">Geral</h2>
          <SettingsForm settings={settings} />
        </Card>
      )}

      <Card>
        <h2 className="font-display italic font-bold text-xl uppercase mb-4">Novo pacote de moedas</h2>
        <CreatePackageForm />
      </Card>

      <div className="flex flex-col gap-3">
        {(packages ?? []).map((pkg) => (
          <PackageCard key={pkg.id} pkg={pkg} />
        ))}
        {(packages ?? []).length === 0 && <p className="text-ink-dim">Nenhum pacote cadastrado.</p>}
      </div>
    </div>
  );
}
