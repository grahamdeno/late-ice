import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import * as S from "@/server/staff";
import { computeMilestones } from "@/server/milestones";

export const dynamic = "force-dynamic";

import { recomputeAll } from "@/server/rating";
export const maxDuration = 60;

export const POST = handle(async (req) => {
  const u = await A.requireUser(req);
  await P.require_(sql, u, "ratings.recompute");
  const r = await recomputeAll();
  await A.refreshDisplays(sql, true);
  const merges = await S.runDueMerges();
  const milestones = await sql.begin((tx) => computeMilestones(tx));
  await P.audit(sql, u.id, "ratings.recompute", { type: "system" }, undefined, { ...r, merges, milestones });
  return { ...r, merges, milestones };
});
