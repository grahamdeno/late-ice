import Staff from "@/views/Staff";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  return <Staff leagueId={p.id} />;
}
