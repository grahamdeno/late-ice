import { ImageResponse } from "next/og";
import { sql } from "@/server/db";
import { num } from "@/server/http";
import { SIZES, cardFormat, gameCardData, safeColor } from "@/server/cards";
import { userFromRequest } from "@/server/accounts";
import { assertGameVisible } from "@/server/visibility";

export const dynamic = "force-dynamic";

/** A result card for sharing: ?format=wide (link previews) or ?format=story (tall, for stories). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let d;
  try { d = await gameCardData(sql, num(id)); } catch { return new Response("Not found", { status: 404 }); }
  // Real names only for people with an account; link previews and strangers get nothing.
  const viewer = await userFromRequest(req).catch(() => null);
  try { await assertGameVisible(sql, viewer, num(id)); } catch { return new Response("Sign in to see this.", { status: 401 }); }
  const format = cardFormat(new URL(req.url).searchParams.get("format"));
  const { width, height } = SIZES[format];
  const tall = format === "story";
  const home = safeColor(d.home_color), away = safeColor(d.away_color, "#ff3b3b");
  const big = tall ? 150 : 110;
  const label = d.mode === "voted" ? "Three stars, voted by the players" : "Three stars";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#05070B", color: "#fff", padding: tall ? 90 : 56, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: tall ? 40 : 28, color: "#9aa7b8" }}>
          <div style={{ display: "flex" }}>{d.league}</div>
          <div style={{ display: "flex" }}>Final{d.played_on ? ` · ${d.played_on}` : ""}</div>
        </div>
        <div style={{ display: "flex", flexDirection: tall ? "column" : "row", alignItems: "center", justifyContent: "space-around", gap: tall ? 60 : 24 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: tall ? "100%" : 400 }}>
            <div style={{ display: "flex", width: tall ? 40 : 24, height: tall ? 40 : 24, borderRadius: 40, background: home }} />
            <div style={{ display: "flex", fontSize: tall ? 56 : 38, fontWeight: 800, marginTop: 14, textAlign: "center" }}>{d.home}</div>
          </div>
          <div style={{ display: "flex", fontSize: big, fontWeight: 900 }}>{d.home_score} – {d.away_score}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: tall ? "100%" : 400 }}>
            <div style={{ display: "flex", width: tall ? 40 : 24, height: tall ? 40 : 24, borderRadius: 40, background: away }} />
            <div style={{ display: "flex", fontSize: tall ? 56 : 38, fontWeight: 800, marginTop: 14, textAlign: "center" }}>{d.away}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {d.stars.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: tall ? 18 : 6 }}>
              <div style={{ display: "flex", fontSize: tall ? 34 : 22, color: "#ff3b3b", letterSpacing: 2 }}>{label.toUpperCase()}</div>
              {d.stars.map((s: { name: string; line: string }, i: number) => (
                <div key={i} style={{ display: "flex", fontSize: tall ? 52 : 32, fontWeight: 700 }}>
                  {"★".repeat(3 - i)}  {s.name}  <span style={{ marginLeft: 16, color: "#9aa7b8", fontWeight: 400 }}>{s.line}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", marginTop: tall ? 60 : 24, fontSize: tall ? 40 : 26, color: "#9aa7b8" }}>Late Ice · Every game counts. Even the 11:15.</div>
        </div>
      </div>
    ),
    { width, height, headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
