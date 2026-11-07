import { handle } from "@/server/http";
import { sql } from "@/server/db";
import { SAMPLES } from "@/server/sheets";
import { userFromRequest } from "@/server/accounts";
import { can } from "@/server/permissions";

export const dynamic = "force-dynamic";
/** Sample scoresheets for testing the reader. Admins only; everyone else gets none. */
export const GET = handle(async (req) => {
  const u = await userFromRequest(req).catch(() => null);
  if (!(await can(sql, u, "ratings.recompute"))) return [];
  return SAMPLES.map(({ id, title, file }) => ({ id, title, image: `/samples/${file}` }));
});
