import Wrapped from "@/views/Wrapped";

export default async function Page({ params, searchParams }: { params: Promise<{ teamId: string; seasonId: string }>; searchParams: Promise<{ p?: string; s?: string }> }) {
  const [p, q] = await Promise.all([params, searchParams]);
  return <Wrapped teamId={p.teamId} seasonId={p.seasonId} playerKey={q.p ?? null} shareKey={q.s ?? null} />;
}
