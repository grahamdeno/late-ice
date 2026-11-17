import { TeamWrapped } from "@/views/Wrapped";

export default async function Page({ params, searchParams }: { params: Promise<{ teamId: string; seasonId: string }>; searchParams: Promise<{ s?: string }> }) {
  const [p, q] = await Promise.all([params, searchParams]);
  return <TeamWrapped teamId={p.teamId} seasonId={p.seasonId} shareKey={q.s ?? null} />;
}
