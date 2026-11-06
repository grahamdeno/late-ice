import { handle, body } from "@/server/http";
import { HttpError } from "@/server/services";
import { forgetToken, requireUser } from "@/server/accounts";
import { supabaseAdmin } from "@/server/supabase";
import { deleteAccountRow } from "@/server/privacy";

export const dynamic = "force-dynamic";

const TOKEN_NOTE = "An existing access token keeps working until it expires. Signing out revokes refresh sessions only, and only when the sign-in service accepts it.";

/** Remove the signed-in account. Game lines stay on anonymized player rows. */
export const POST = handle(async (req) => {
  const u = await requireUser(req);
  const b = await body(req);
  if (b?.confirm !== true) throw new HttpError(400, "Confirm the deletion.");
  let deleted;
  try {
    deleted = await deleteAccountRow(u);
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    if (e?.code === "23503") throw new HttpError(409, "This account is linked to a record that has to stay. It was not deleted.");
    throw e;
  }
  const jwt = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  if (jwt) forgetToken(jwt);
  let sessionsRevoked = false;
  let authUserRemoved = !u.auth_id;
  if (jwt) {
    const signedOut = await supabaseAdmin().auth.admin.signOut(jwt, "global");
    sessionsRevoked = !signedOut.error;
  }
  if (u.auth_id) {
    const removed = await supabaseAdmin().auth.admin.deleteUser(u.auth_id);
    authUserRemoved = !removed.error;
  }
  const message = authUserRemoved
    ? "Your Late Ice profile was removed. Game lines stay. An existing access token keeps working until it expires."
    : "Your Late Ice profile was removed. The sign-in record could not be removed, and an existing access token keeps working until it expires.";
  return {
    ok: true,
    anonymized: deleted.anonymized,
    gameLinesKept: deleted.gameLinesKept,
    sessionsRevoked,
    authUserRemoved,
    accessTokenRevoked: false,
    message,
    accessTokenNote: TOKEN_NOTE,
  };
});
