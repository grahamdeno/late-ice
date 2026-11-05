"use client";
import { Link } from "@/lib/router";
import { Empty } from "@/lib/ui";

export default function NotFound() {
  return <div className="mt-6"><Empty title="Nothing here" body="That page doesn't exist, or it moved." action={<Link href="/" className="btn btn-red">Home</Link>} /></div>;
}
