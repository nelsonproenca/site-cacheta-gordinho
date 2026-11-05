import { LinkGoogleForm } from "./link-google-form";

export default async function VincularGooglePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; ref?: string }>;
}) {
  const { next, ref } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <p className="caption">Cacheta Gordinho</p>
        <h1 className="font-display text-3xl italic font-extrabold uppercase">Quase lá!</h1>
        <p className="text-ink-dim text-sm mt-1">Escolha seu nick para continuar.</p>
      </div>
      <LinkGoogleForm next={next && next.startsWith("/") ? next : "/jogar/treino"} referralCode={ref ?? null} />
    </main>
  );
}
