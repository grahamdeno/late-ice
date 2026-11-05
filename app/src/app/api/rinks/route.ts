import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";

export const dynamic = "force-dynamic";
export const GET = handle(async () => q(sql, "SELECT id, name, address FROM rinks ORDER BY name"));
