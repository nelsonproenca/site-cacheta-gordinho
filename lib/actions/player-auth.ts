"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeHandle } from "@/lib/utils";

export type PlayerAuthState = { error: string } | { success: string; phone: string } | null;

// Player login is phone-only (no password, no e-mail) — mirrors the "cadastro
// leve" identity model (prd.md §4.1) instead of introducing a second parallel
// auth scheme. Brazil-only for now (formatBrPhone/PhoneInput are already
// BR-specific everywhere else in this codebase), so a plain digits-only
// number is always assumed to be a Brazilian mobile in E.164.
function toE164(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return `+55${digits}`;
}

export async function requestPlayerOtp(
  _prevState: PlayerAuthState,
  formData: FormData,
): Promise<PlayerAuthState> {
  const phone = toE164(String(formData.get("phone") ?? ""));

  if (phone.length < 13) {
    return { error: "Informe um telefone válido, com DDD." };
  }

  const supabase = await createClient();
  // actor_type: 'player' is read by handle_new_admin_user (20260801000034) to
  // skip creating an `admins` row for this auth.users insert — never omit it
  // here, or a brand-new player's first login fails on admins.email not null.
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { data: { actor_type: "player" } },
  });

  if (error) return { error: error.message };
  return { success: "Código enviado por SMS.", phone };
}

export async function verifyPlayerOtp(
  _prevState: PlayerAuthState,
  formData: FormData,
): Promise<PlayerAuthState> {
  const phone = String(formData.get("phone") ?? "");
  const token = String(formData.get("token") ?? "").trim();
  const handle = normalizeHandle(String(formData.get("tiktok_handle") ?? ""));
  const displayName = String(formData.get("display_name") ?? "").trim();
  const next = String(formData.get("next") ?? "") || "/ao-vivo";

  if (!token) return { error: "Informe o código recebido por SMS.", phone };

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (verifyError) return { error: verifyError.message, phone };

  // Repeat login (handle/displayName are ignored by the RPC once a players
  // row is already linked to this auth.uid()) sends these fields too — the
  // form always collects them since there's no way to know in advance
  // whether this is a first login until after verifyOtp succeeds.
  const { error: linkError } = await supabase.rpc("link_or_create_player", {
    p_tiktok_handle: handle,
    p_display_name: displayName,
  });
  if (linkError) return { error: linkError.message, phone };

  redirect(next);
}
