import { NextResponse } from "next/server";
import { handle } from "@/server/http";
import { one, sql } from "@/server/db";

export const dynamic = "force-dynamic";

/** Uptime check. The database has to answer SELECT 1. */
export const GET = handle(async () => {
  try {
    await one(sql, "SELECT 1");
    return { ok: true, db: true };
  } catch {
    // Do not log the error: a driver message can include the database URL.
    console.error("health check: database did not answer");
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
});
