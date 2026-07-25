import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import { AccountSidenavLinks } from "./account-sidenav-links";

export default async function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { count: pendingCount } = await supabase
    .from("admins")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <div className="shell">
      <nav className="sidenav">
        <div className="px-6 pb-7 mb-5 border-b border-stroke">
          <div className="font-display italic font-extrabold uppercase text-lg">Caxeta Gordinho</div>
          <div className="caption mt-1">Painel admin</div>
        </div>
        <div className="nav-group">
          <div className="nav-label">Contas</div>
          <Link className="nav-item" href="/admin/contas/nova">
            Nova conta
          </Link>
          <Link className="nav-item" href="/admin/contas">
            Listar contas
          </Link>
          <AccountSidenavLinks />
        </div>
        <div className="nav-group">
          <div className="nav-label">Administradores</div>
          <Link className="nav-item justify-between" href="/admin/solicitacoes">
            <span>Solicitações pendentes</span>
            {!!pendingCount && <span className="badge badge-red">{pendingCount}</span>}
          </Link>
        </div>
        <div className="nav-group mt-auto px-3">
          <form action={signOut}>
            <button type="submit" className="nav-item w-full text-left">
              Sair
            </button>
          </form>
        </div>
      </nav>
      <main className="content p-8">{children}</main>
    </div>
  );
}
