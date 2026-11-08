import Lineup from "@/views/Lineup";

export default async function Page({ params }: { params: Promise<{ id: string; gid: string }> }) {
  const p = await params;
  return <Lineup teamId={p.id} gameId={p.gid} />;
}
