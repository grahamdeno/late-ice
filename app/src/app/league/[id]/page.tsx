import { LeaguePage } from "@/views/Leagues";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  return <LeaguePage id={p.id} />;
}
