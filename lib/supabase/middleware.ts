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
  const isPlayerProtectedRoute =
    request.nextUrl.pathname.startsWith("/ao-vivo") || request.nextUrl.pathname.startsWith("/minha-conta");

  if (isPlayerProtectedRoute) {
    let hasPlayer = false;
    if (user) {
      const { data: player } = await supabase
        .from("players")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      hasPlayer = !!player;
    }
    if (!hasPlayer) {
      const url = request.nextUrl.clone();
      url.pathname = "/entrar";
      url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
