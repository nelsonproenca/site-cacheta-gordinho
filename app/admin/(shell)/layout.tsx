import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Plus, List, Shield, Inbox, Gamepad2, Play, Target, UserRound, Trophy, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import { NavGroup } from "@/components/ui/nav-group";

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
          <div className="caption mt-1">Painel admin</div>
        </div>
        <NavGroup label="Contas" icon={<Users size={15} />} matchPrefixes={["/admin/contas"]}>
          <Link className="nav-item" href="/admin/contas/nova">
            <Plus size={16} aria-hidden="true" /> Criar
          </Link>
          <Link className="nav-item" href="/admin/contas">
            <List size={16} aria-hidden="true" /> Listar
          </Link>
        </NavGroup>
        <NavGroup label="Administradores" icon={<Shield size={15} />} matchPrefixes={["/admin/solicitacoes"]}>
          <Link className="nav-item justify-between" href="/admin/solicitacoes">
            <span className="flex items-center gap-2">
              <Inbox size={16} aria-hidden="true" /> Solicitações pendentes
            </span>
            {!!pendingCount && <span className="badge badge-red">{pendingCount}</span>}
          </Link>
        </NavGroup>
        <NavGroup
          label="Partidas"
          icon={<Gamepad2 size={15} />}
          matchPrefixes={["/admin/partidas", "/admin/pontuacao", "/admin/jogadores"]}
        >
          <Link className="nav-item" href="/admin/partidas/criar">
            <Plus size={16} aria-hidden="true" /> Criar
          </Link>
          <Link className="nav-item" href="/admin/partidas/jogar">
            <Play size={16} aria-hidden="true" /> Jogar
          </Link>
          <Link className="nav-item" href="/admin/pontuacao">
            <Target size={16} aria-hidden="true" /> Pontuação
          </Link>
          <Link className="nav-item" href="/admin/jogadores">
            <UserRound size={16} aria-hidden="true" /> Jogadores
          </Link>
        </NavGroup>
        <NavGroup label="Cachetão" icon={<Trophy size={15} />} matchPrefixes={["/admin/cachetao"]}>
          <Link className="nav-item" href="/admin/cachetao/criar">
            <Plus size={16} aria-hidden="true" /> Criar
          </Link>
          <Link className="nav-item" href="/admin/cachetao/jogar">
            <Play size={16} aria-hidden="true" /> Jogar
          </Link>
        </NavGroup>
        <div className="nav-group mt-auto px-3">
          <form action={signOut}>
            <button type="submit" className="nav-label-action">
              <LogOut size={15} aria-hidden="true" /> Sair
            </button>
          </form>
        </div>
      </nav>
      <main className="content p-8">{children}</main>
    </div>
  );
}
