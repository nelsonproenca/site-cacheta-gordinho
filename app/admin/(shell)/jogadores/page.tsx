import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { TableWrap, Table, TableHead, TableBody, TableRow, TableHeaderCell } from "@/components/ui/table";
import { PlayerForm } from "@/components/player-form";
import { PlayerRow } from "./player-row";

const RETURN_PATH = "/admin/jogadores";

export default async function JogadoresPage() {
  const supabase = await createClient();
  const { data: players } = await supabase
    .from("players")
    .select("id, display_name, tiktok_handle, whatsapp")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Jogadores</h1>
        <p className="text-ink-dim">Cadastro é global à plataforma — o mesmo jogador pode participar de qualquer conta gerenciada.</p>
      </div>

      <Card>
        <h2 className="font-display italic font-bold text-xl uppercase mb-4">Novo jogador</h2>
        <PlayerForm returnPath={RETURN_PATH} />
      </Card>

      <TableWrap>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Jogador</TableHeaderCell>
              <TableHeaderCell>@tiktok</TableHeaderCell>
              <TableHeaderCell>WhatsApp</TableHeaderCell>
              <TableHeaderCell>Ações</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(players ?? []).map((p) => (
              <PlayerRow key={p.id} player={p} returnPath={RETURN_PATH} />
            ))}
          </TableBody>
        </Table>
      </TableWrap>
      {(players ?? []).length === 0 && <p className="text-ink-dim">Nenhum jogador cadastrado ainda.</p>}
    </div>
  );
}
