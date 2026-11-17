import { ImageResponse } from "next/og";
import { sql } from "@/server/db";
import { num } from "@/server/http";
import { SIZES, cardFormat, safeColor } from "@/server/cards";
import { userFromRequest } from "@/server/accounts";
import { HttpError } from "@/server/services";
import { buildRecap, buildTeamWrap, recapAccess, teamWrapAccess, teamWrapCard } from "@/server/wrapped";
import { cardAlt } from "@/server/wrapped-core";

export const dynamic = "force-dynamic";

/**
 * A Season Wrapped card as a picture. ?card=<kind> picks one card of a player's recap (default: the first);
 * ?team=1 is the team wrap. A shared link's p and s carry the signed key; without a valid key or your own sign-in
 * there is no picture. The text drawn is exactly the recap text, so names follow the same privacy rules, and the
 * same words go out as the picture's alt text in X-Card-Alt (URL-encoded).
 */
export async function GET(req: Request, ctx: { params: Promise<{ teamId: string; seasonId: string }> }) {
  const { teamId, seasonId } = await ctx.params;
  const url = new URL(req.url);
  const viewer = await userFromRequest(req).catch(() => null);
  let card, color = "#2f6bff";
  try {
    const t = num(teamId), s = num(seasonId);
    if (url.searchParams.get("team") === "1") {
      const w = await buildTeamWrap(sql, await teamWrapAccess(sql, viewer, t, s, url.searchParams.get("s")), t, s);
      card = teamWrapCard(w); color = safeColor(w.team.color);
    } else {
      const r = await buildRecap(sql, await recapAccess(sql, viewer, t, s, url.searchParams.get("p"), url.searchParams.get("s")), t, s);
      const want = url.searchParams.get("card");
      card = r.cards.find((c) => c.kind === want) ?? r.cards[0]; color = safeColor(r.team.color);
    }
  } catch (e: any) {
    if (e instanceof HttpError) return new Response(e.message, { status: e.status });
    return new Response("Not found", { status: 404 });
  }
  if (!card) return new Response("Not found", { status: 404 });
  const format = cardFormat(url.searchParams.get("format"));
  const { width, height } = SIZES[format];
  const tall = format === "story";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#05070B", color: "#fff", padding: tall ? 90 : 56, fontFamily: "sans-serif", borderTop: `${tall ? 24 : 14}px solid ${color}` }}>
        <div style={{ display: "flex", fontSize: tall ? 44 : 28, color: "#9aa7b8", letterSpacing: 2 }}>{card.title.toUpperCase()}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: tall ? 120 : 76, fontWeight: 900, lineHeight: 1.05 }}>{card.headline}</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: tall ? 48 : 20, gap: tall ? 20 : 8 }}>
            {card.lines.map((l: string, i: number) => (
              <div key={i} style={{ display: "flex", fontSize: tall ? 48 : 30, color: "#dfe7f1" }}>{l}</div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: tall ? 40 : 26, color: "#9aa7b8" }}>Late Ice · Every game counts. Even the 11:15.</div>
      </div>
    ),
    { width, height, headers: { "Cache-Control": "private, max-age=300", "X-Card-Alt": encodeURIComponent(cardAlt(card)) } },
  );
}
