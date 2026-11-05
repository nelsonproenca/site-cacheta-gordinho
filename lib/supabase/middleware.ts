import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
  const isLoginRoute = request.nextUrl.pathname === "/admin/login";
  const isAguardandoRoute = request.nextUrl.pathname === "/admin/aguardando";

  if (!user && isAdminRoute && !isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  // New self-signups start 'pending' (see 20260718000018_admins_approval)
  // and can't use anything under /admin until an existing approved admin
  // reviews them — keep them corralled on the waiting page instead of
  // letting them wander into pages that'll just error on missing access.
  if (user && isAdminRoute && !isLoginRoute && !isAguardandoRoute) {
    const { data: admin } = await supabase.from("admins").select("status").eq("id", user.id).maybeSingle();
    if (admin?.status !== "approved") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/aguardando";
      return NextResponse.redirect(url);
    }
  }

  // Player-facing gate (Fase 5, M0) — independent of the /admin checks above.
  // "/ao-vivo" is deliberately login-only end to end (prd.md §4.14: "sem
  // vitrine pública anônima"), so both the listing and a specific broadcast
  // require a linked player, not just a Supabase session (an admin who never
  // linked a player, or mid-signup with no players row yet, still redirects).
  // No "pending" concept here — link_or_create_player runs synchronously
  // right after OTP verification, there's no approval queue to wait on.
  //
  // "/jogar" (Fase 6 — jogo de Cacheta jogável) used to join this same
  // login-only gate ("no anonymous mesa", spec FR-014) — reversed per
  // explicit later decision: a visitor just types a display name and plays
  // (see lib/actions/player-auth.ts's enterAsGuest, backed by Supabase
  // Anonymous Auth, not phone OTP). "/ao-vivo" and "/minha-conta" are
  // untouched and still require the real OTP login.
  const isJogarRoute = request.nextUrl.pathname.startsWith("/jogar");
  // /jogar/vincular-google (specs/002-moedas-pagamento-indicacao, US4) é
  // alcançada logo após o callback do Google — a sessão já existe, mas
  // ainda não há players row (é exatamente o que essa página resolve), então
  // precisa do mesmo tipo de exclusão que /jogar/entrar já tem, ou o gate
  // abaixo redirecionaria de volta para /jogar/entrar num loop sem saída.
  const isJogarEntrarRoute =
    request.nextUrl.pathname === "/jogar/entrar" || request.nextUrl.pathname === "/jogar/vincular-google";
  // /carteira e /indicacao (specs/002-moedas-pagamento-indicacao) tocam
  // dinheiro — além de exigir um players row (como as demais rotas
  // protegidas), exigem especificamente que não seja um convidado
  // (is_guest), já que um convidado via /jogar/entrar também tem um
  // players row e passaria pelo gate "hasPlayer" sozinho.
  const isIdentifiedOnlyRoute =
    request.nextUrl.pathname.startsWith("/carteira") || request.nextUrl.pathname.startsWith("/indicacao");
  const isPlayerProtectedRoute =
    request.nextUrl.pathname.startsWith("/ao-vivo") ||
    request.nextUrl.pathname.startsWith("/minha-conta") ||
    isIdentifiedOnlyRoute ||
    (isJogarRoute && !isJogarEntrarRoute);

  if (isPlayerProtectedRoute) {
    let hasPlayer = false;
    let isGuest = false;
    if (user) {
      const { data: player } = await supabase
        .from("players")
        .select("id, is_guest")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      hasPlayer = !!player;
      isGuest = !!player?.is_guest;
    }
    if (!hasPlayer || (isIdentifiedOnlyRoute && isGuest)) {
      const url = request.nextUrl.clone();
      url.pathname = isJogarRoute ? "/jogar/entrar" : "/entrar";
      url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
