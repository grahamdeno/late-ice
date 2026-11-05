import { PlayerPage } from "@/views/Players";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  return <PlayerPage id={p.id} />;
}
