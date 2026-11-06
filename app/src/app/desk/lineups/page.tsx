import type { Metadata } from "next";
import { DeskTeams } from "@/views/Desk";

export const metadata: Metadata = { title: "Games and lineups · Rink Desk" };

export default function Page() {
  return <DeskTeams />;
}
