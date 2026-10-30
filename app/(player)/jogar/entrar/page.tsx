import { GuestLoginForm } from "./guest-login-form";

// Entry point for the Cacheta game (/jogar/**) — deliberately separate from
// /entrar (phone-OTP login), which stays reserved for /ao-vivo and
// /minha-conta. See lib/actions/player-auth.ts (enterAsGuest) for why.
export default async function JogarEntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <p className="caption">Cacheta Gordinho</p>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Jogar Cacheta</h1>
        <p className="text-ink-dim text-sm mt-1">Sem cadastro — só o nome que vai aparecer na mesa.</p>
      </div>
      <GuestLoginForm next={next && next.startsWith("/jogar") ? next : "/jogar/treino"} />
    </main>
  );
}
