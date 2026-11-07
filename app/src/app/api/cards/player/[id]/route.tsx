import { ImageResponse } from "next/og";
import { sql } from "@/server/db";
import { num } from "@/server/http";
import { SIZES, cardFormat, playerCardData, safeColor } from "@/server/cards";
import { userFromRequest } from "@/server/accounts";
import { assertPlayerVisible } from "@/server/visibility";

export const dynamic = "force-dynamic";

/** A player card for sharing. Only for players who have claimed their spot and haven't hidden themselves. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let d;
  try { d = await playerCardData(sql, num(id)); } catch { return new Response("Not found", { status: 404 }); }
  // Real names only for people with an account; link previews and strangers get nothing.
  const viewer = await userFromRequest(req).catch(() => null);
  try { await assertPlayerVisible(sql, viewer, num(id)); } catch { return new Response("Sign in to see this.", { status: 401 }); }
  const format = cardFormat(new URL(req.url).searchParams.get("format"));
  const { width, height } = SIZES[format];
  const tall = format === "story";
  const color = safeColor(d.color);
  const stat = (label: string, value: string | number) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: tall ? 280 : 170 }}>
      <div style={{ display: "flex", fontSize: tall ? 96 : 64, fontWeight: 900 }}>{value}</div>
      <div style={{ display: "flex", fontSize: tall ? 30 : 22, color: "#9aa7b8", letterSpacing: 2 }}>{label}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#05070B", color: "#fff", padding: tall ? 90 : 56, fontFamily: "sans-serif", borderTop: `${tall ? 24 : 14}px solid ${color}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: tall ? 40 : 28, color: "#9aa7b8" }}>
          <div style={{ display: "flex" }}>{d.team ?? "Late Ice"}</div>
          <div style={{ display: "flex" }}>{d.position === "G" ? "Goalie" : d.position === "D" ? "Defense" : "Forward"}{d.number ? ` · #${d.number}` : ""}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: tall ? 110 : 76, fontWeight: 900, lineHeight: 1.05 }}>{d.name}</div>
          <div style={{ display: "flex", marginTop: 12, fontSize: tall ? 48 : 34, color: "#ff3b3b" }}>Rating {d.rating.toFixed(1)}{d.rated < 5 ? "  (still settling)" : ""}</div>
          {d.milestone && <div style={{ display: "flex", marginTop: 12, fontSize: tall ? 44 : 30 }}>★ {d.milestone}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-around" }}>
            {stat("GAMES", d.gp)}{stat("GOALS", d.g)}{stat("ASSISTS", d.a)}{stat("POINTS", d.g + d.a)}
          </div>
          <div style={{ display: "flex", marginTop: tall ? 60 : 24, fontSize: tall ? 40 : 26, color: "#9aa7b8" }}>Late Ice · Every game counts. Even the 11:15.</div>
        </div>
      </div>
    ),
    { width, height, headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
