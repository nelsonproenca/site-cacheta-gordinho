import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { TableWrap, Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/table";

// Ranking do jogo de Cacheta jogável (US3) — lido de cacheta_game_results
// (SELECT pública), estruturalmente separado do ranking de pontuação
// manual de lives (lib/scoring/get-ranking.ts, intocado por esta feature —
// ver spec FR-013/SC-006). Nenhum estado de sessão/jogador aqui: a leitura
// é pública, sem exigir login, mesma política da tabela.
export default async function CachetaRankingPage() {
  const supabase = await createClient();

  const { data: results } = await supabase
    .from("cacheta_game_results")
    .select("winner_player_id, combination_type, points_awarded");

  const totals = new Map<string, { points: number; wins: number }>();
  for (const r of results ?? []) {
    if (!r.winner_player_id) continue;
    const entry = totals.get(r.winner_player_id) ?? { points: 0, wins: 0 };
    entry.points += r.points_awarded;
    entry.wins += 1;
    totals.set(r.winner_player_id, entry);
  }

  const playerIds = [...totals.keys()];
  const names: Record<string, { displayName: string; tiktokHandle: string }> = {};
  if (playerIds.length > 0) {
    const { data: players } = await supabase.from("players").select("id, display_name, tiktok_handle").in("id", playerIds);
    for (const p of players ?? []) names[p.id] = { displayName: p.display_name, tiktokHandle: p.tiktok_handle };
  }

  const ranking = playerIds
    .map((id) => ({ id, ...totals.get(id)!, ...(names[id] ?? { displayName: "Jogador", tiktokHandle: "" }) }))
    .sort((a, b) => b.points - a.points);

  return (
    <main className="flex flex-1 flex-col gap-4 p-6 sm:p-8 max-w-2xl mx-auto w-full">
      <div>
        <p className="caption">Cacheta Gordinho</p>
        <h1 className="font-display text-2xl italic font-extrabold uppercase">Ranking — Cacheta jogável</h1>
        <Badge variant="purple">Jogo online/treino</Badge>
        <p className="text-ink-dim text-sm mt-2">
          Pontuação deste jogo (mesa virtual, treino ou online) — não é o mesmo ranking de pontuação manual das lives.
        </p>
      </div>

      {ranking.length === 0 ? (
        <p className="text-ink-dim">Ainda sem partidas concluídas.</p>
      ) : (
        <TableWrap>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>#</TableHeaderCell>
                <TableHeaderCell>Jogador</TableHeaderCell>
                <TableHeaderCell>Vitórias</TableHeaderCell>
                <TableHeaderCell>Pontos</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ranking.map((entry, i) => (
                <TableRow key={entry.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>
                    {entry.displayName} {entry.tiktokHandle && <span className="text-ink-dim">@{entry.tiktokHandle}</span>}
                  </TableCell>
                  <TableCell>{entry.wins}</TableCell>
                  <TableCell className="mono-data">{entry.points}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}
    </main>
  );
}
