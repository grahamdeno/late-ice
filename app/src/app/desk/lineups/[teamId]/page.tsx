import type { Metadata } from "next";
import { DeskLineups } from "@/views/Desk";

export const metadata: Metadata = { title: "Lineups · Rink Desk" };

export default async function Page({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  return <DeskLineups teamId={teamId} />;
}
