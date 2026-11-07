import type { Metadata } from "next";
import { DeskSheet } from "@/views/DeskSheets";

export const metadata: Metadata = { title: "Check a scoresheet · Rink Desk" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DeskSheet id={id} />;
}
