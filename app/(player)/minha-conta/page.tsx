import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOutToHome } from "@/lib/actions/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function MinhaContaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar?next=/minha-conta");

  const { data: player } = await supabase
    .from("players")
    .select("display_name, tiktok_handle")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!player) redirect("/entrar?next=/minha-conta");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <Card className="flex w-full max-w-sm flex-col gap-4">
        <div>
          <p className="caption">Minha conta</p>
          <h1 className="font-display text-2xl italic font-extrabold uppercase">
            {player.display_name}
          </h1>
          <p className="text-ink-dim mono-data">@{player.tiktok_handle}</p>
        </div>
        {user.phone && <p className="text-ink-dim text-sm">Telefone verificado: {user.phone}</p>}
        <form action={signOutToHome}>
          <Button type="submit" variant="outline" className="w-full">
            Sair
          </Button>
        </form>
      </Card>
    </main>
  );
}
