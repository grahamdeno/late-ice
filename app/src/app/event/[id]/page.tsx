import EventPage from "@/views/Event";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  return <EventPage id={p.id} />;
}
