import { handle } from "@/server/http";
import { userFromRequest } from "@/server/accounts";
import { HttpError } from "@/server/services";
import { dailyAllowance } from "@/server/scanlimits";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const user = await userFromRequest(req);
  if (!user) throw new HttpError(401, "Sign in to scan a sheet.");
  return dailyAllowance(user);
});
