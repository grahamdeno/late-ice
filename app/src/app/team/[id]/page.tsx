import { TeamPage } from "@/views/Leagues";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  return <TeamPage id={p.id} />;
}
