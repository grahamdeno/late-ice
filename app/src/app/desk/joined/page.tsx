import type { Metadata } from "next";
import { DeskJoined } from "@/views/DeskJoined";

export const metadata: Metadata = { title: "Who's joined · Rink Desk" };

export default function Page() {
  return <DeskJoined />;
}
