import type { Metadata } from "next";
import { DeskRoster } from "@/views/DeskRoster";

export const metadata: Metadata = { title: "Players and rosters · Rink Desk" };

export default function Page() {
  return <DeskRoster />;
}
