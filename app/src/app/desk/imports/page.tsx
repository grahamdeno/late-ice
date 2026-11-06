import type { Metadata } from "next";
import { DeskImports } from "@/views/DeskImports";

export const metadata: Metadata = { title: "Imports · Rink Desk" };

export default function Page() {
  return <DeskImports />;
}
