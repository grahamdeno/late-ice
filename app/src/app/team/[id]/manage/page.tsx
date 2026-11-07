import ManageTeam from "@/views/ManageTeam";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  return <ManageTeam id={p.id} />;
}
