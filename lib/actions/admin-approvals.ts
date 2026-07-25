"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Goes through approve_pending_admin (20260724000024) instead of a plain RLS
// update — approving a 'moderador' also has to grant them the same
// admin_account_access rows their linked streamer has, which the approving
// admin's own session can't necessarily write (only the streamer owns those
// accounts), so that step needs the RPC's security definer. The RPC
// re-checks the caller is an approved admin itself, same authorization the
// old admins_approve_pending policy used to enforce.
export async function approvePendingAdmin(formData: FormData) {
  const adminId = String(formData.get("admin_id") ?? "");
  if (!adminId) return;

  const supabase = await createClient();
  await supabase.rpc("approve_pending_admin", { p_admin_id: adminId });

  revalidatePath("/admin/solicitacoes");
}

// "Excluir" removes the request outright — admins.id -> auth.users.id is ON
// DELETE CASCADE, but deleting an auth.users row at all requires the
// service-role admin API (no RLS policy can do this, admins has no delete
// policy). Service role bypasses RLS entirely, so — unlike approvePendingAdmin
// above — the caller's own approved status has to be checked explicitly here.
export async function rejectPendingAdmin(formData: FormData) {
  const adminId = String(formData.get("admin_id") ?? "");
  if (!adminId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: caller } = await supabase.from("admins").select("status").eq("id", user.id).maybeSingle();
  if (caller?.status !== "approved") return;

  const service = createServiceClient();
  await service.auth.admin.deleteUser(adminId);

  revalidatePath("/admin/solicitacoes");
}
