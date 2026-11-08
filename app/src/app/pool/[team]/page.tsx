import Pool from "@/views/Pool";

export default async function Page({ params }: { params: Promise<{ team: string }> }) {
  const p = await params;
  return <Pool teamId={p.team} />;
}
