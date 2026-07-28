import { LoginForm } from "./login-form";
import { authErrorMessage } from "@/lib/auth-errors";
import { createServiceClient } from "@/lib/supabase/service";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // admins has no public select policy, and this page renders before any
  // session exists — the streamer picklist for "Criar conta" (moderador
  // mode) can only be built with the service-role client, same as any other
  // pre-auth privileged read in this app.
  const service = createServiceClient();
  const { data: streamers } = await service
    .from("admins")
    .select("id, name")
    .eq("user_type", "streamer")
    .eq("status", "approved")
    .order("name", { ascending: true });

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <p className="caption">Cacheta Gordinho · Painel</p>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Acesso administrativo</h1>
      </div>
      <LoginForm initialError={authErrorMessage(error)} streamers={streamers ?? []} />
    </main>
  );
}
