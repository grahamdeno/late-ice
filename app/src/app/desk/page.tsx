import type { Metadata } from "next";
import { DeskHome } from "@/views/Desk";

export const metadata: Metadata = { title: "Rink Desk · Late Ice" };

export default function Page() {
  return <DeskHome />;
}
