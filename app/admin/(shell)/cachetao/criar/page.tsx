import { createClient } from "@/lib/supabase/server";
import { CreateEventForm } from "../../[accountId]/cachetao/create-event-form";

// Global entry point for creating a Cachetão event — same CreateEventForm
// used at /admin/[accountId]/cachetao, just with an account <select> instead
// of the accountId coming from the URL (see that component's accountId/
// accounts discriminated union).
export default async function CriarCachetaoPage() {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("tiktok_accounts")
    .select("id, handle, display_name")
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Novo Cachetão</h1>
        <p className="text-ink-dim">Escolha a conta e configure o evento.</p>
      </div>

      <CreateEventForm accounts={accounts ?? []} />
    </div>
  );
}
