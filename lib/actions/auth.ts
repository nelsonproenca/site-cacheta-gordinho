"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = { error: string } | { success: string } | null;

export async function signIn(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/admin/contas");
}

export async function signUp(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const userType = String(formData.get("user_type") ?? "");
  const streamerId = String(formData.get("streamer_id") ?? "");

  if (userType !== "streamer" && userType !== "moderador") {
    return { error: "Selecione se você é streamer ou moderador." };
  }
  if (userType === "moderador" && !streamerId) {
    return { error: "Selecione a qual streamer você está vinculado." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        user_type: userType,
        streamer_id: userType === "moderador" ? streamerId : "",
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (!data.session) {
    return {
      success:
        "Conta criada. Confirme seu e-mail e aguarde a aprovação de um administrador antes de acessar o painel.",
    };
  }

  redirect("/admin/aguardando");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

// Same as signOut, but for the global masthead's AccountMenu (app/layout.tsx)
// — that bar renders on every page, public ones included, so "Sair" there
// should land on the home page, not force a detour through /admin/login.
export async function signOutToHome() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
