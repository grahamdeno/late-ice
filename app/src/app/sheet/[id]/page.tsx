import Sheet from "@/views/Sheet";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  return <Sheet id={p.id} />;
}
