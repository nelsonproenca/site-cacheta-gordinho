import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

export default async function AguardandoAprovacaoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const { data: admin } = await supabase.from("admins").select("status").eq("id", user.id).maybeSingle();

  // Only a genuinely pending admin lands here — proxy.ts (lib/supabase/middleware.ts)
  // redirects everyone else under /admin to this page too, so an already-approved
  // admin who ends up here (stale bookmark, back button) just continues on.
  if (admin?.status === "approved") redirect("/admin/contas");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div>
        <p className="caption">Cacheta Gordinho · Painel</p>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Aguardando aprovação</h1>
      </div>
      <p className="max-w-md text-ink-dim">
        Seu cadastro foi criado, mas ainda precisa ser aprovado por um administrador existente
        antes de você acessar o painel. Tente novamente mais tarde.
      </p>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sair
        </Button>
      </form>
    </main>
  );
}
