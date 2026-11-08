import Pool from "@/views/Pool";

export default async function Page({ params }: { params: Promise<{ team: string; slot: string }> }) {
  const p = await params;
  return <Pool teamId={p.team} slotId={p.slot} />;
}
