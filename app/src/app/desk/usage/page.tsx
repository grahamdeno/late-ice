import type { Metadata } from "next";
import { DeskUsage } from "@/views/DeskUsage";

export const metadata: Metadata = { title: "Usage · Rink Desk" };

export default function Page() {
  return <DeskUsage />;
}
