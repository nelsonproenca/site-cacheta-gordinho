import { PlayerLoginForm } from "./player-login-form";

export default async function PlayerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <p className="caption">Cacheta Gordinho</p>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Entrar</h1>
        <p className="text-ink-dim text-sm mt-1">Para assistir e participar das lives.</p>
      </div>
      <PlayerLoginForm next={next && next.startsWith("/") ? next : "/ao-vivo"} />
    </main>
  );
}
