import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// specs/002-moedas-pagamento-indicacao, US4 — callback do fluxo de redirect
// do Google OAuth (signInWithOAuth). Troca o código pela sessão; se o
// jogador ainda não tem um players row vinculado, manda escolher nick antes
// de seguir para `next` (preservado como query param na segunda etapa).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/jogar/treino";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: myPlayerId } = await supabase.rpc("current_player_id");
      if (!myPlayerId) {
        return NextResponse.redirect(`${origin}/jogar/vincular-google?next=${encodeURIComponent(next)}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/entrar?error=${encodeURIComponent("Falha ao entrar com Google.")}`);
}
