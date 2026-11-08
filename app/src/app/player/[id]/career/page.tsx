import { CareerPage } from "@/views/Career";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  return <CareerPage id={p.id} />;
}
