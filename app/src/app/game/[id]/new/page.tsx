import Game from "@/views/Game";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  return <Game id={p.id} fresh />;
}
