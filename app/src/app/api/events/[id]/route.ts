import { handle, num } from "@/server/http";
import { sql } from "@/server/db";
import { applyViewerNames, userFromRequest } from "@/server/accounts";
import { eventView } from "@/server/events";

export const dynamic = "force-dynamic";
export const GET = handle<{ id: string }>(async (req, { id }) => {
  const viewer = await userFromRequest(req).catch(() => null);
  const view = await eventView(sql, num(id), viewer);
  view.players = await applyViewerNames(sql, viewer, view.players);
  return view;
});
