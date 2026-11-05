import { handle, num } from "@/server/http";
import { sql } from "@/server/db";
import { userFromRequest } from "@/server/accounts";
import { eventView } from "@/server/events";

export const dynamic = "force-dynamic";
export const GET = handle<{ id: string }>(async (req, { id }) => eventView(sql, num(id), await userFromRequest(req).catch(() => null)));
