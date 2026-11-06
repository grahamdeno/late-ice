import { handle } from "@/server/http";
import { requireUser } from "@/server/accounts";
import { exportAccount } from "@/server/privacy";

export const dynamic = "force-dynamic";

/** JSON export of the signed-in user only. Claude adds the button in Settings. */
export const GET = handle(async (req) => {
  const u = await requireUser(req);
  return exportAccount(u);
});
