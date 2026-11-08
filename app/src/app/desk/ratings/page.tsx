import type { Metadata } from "next";
import { DeskRatings } from "@/views/DeskRatings";

export const metadata: Metadata = { title: "Ratings · Rink Desk" };

export default function Page() {
  return <DeskRatings />;
}
