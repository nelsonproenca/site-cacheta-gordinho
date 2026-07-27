import { createClient } from "@/lib/supabase/server";
import { CreateEventForm } from "../../[accountId]/caxetao/create-event-form";

// Global entry point for creating a Caxetão event — same CreateEventForm
// used at /admin/[accountId]/caxetao, just with an account <select> instead
// of the accountId coming from the URL (see that component's accountId/
// accounts discriminated union).
export default async function CriarCaxetaoPage() {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("tiktok_accounts")
    .select("id, handle, display_name")
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Novo Caxetão</h1>
        <p className="text-ink-dim">Escolha a conta e configure o evento.</p>
      </div>

      <CreateEventForm accounts={accounts ?? []} />
    </div>
  );
}
