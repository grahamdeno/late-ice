import type { Metadata } from "next";
import { DeskSheetQueue } from "@/views/DeskSheets";

export const metadata: Metadata = { title: "Scoresheets · Rink Desk" };

export default function Page() {
  return <DeskSheetQueue />;
}
