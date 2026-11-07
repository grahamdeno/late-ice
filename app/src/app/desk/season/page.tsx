import type { Metadata } from "next";
import { DeskSeason } from "@/views/DeskSeason";

export const metadata: Metadata = { title: "Season · Rink Desk" };

export default function Page() {
  return <DeskSeason />;
}
