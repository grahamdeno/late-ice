// Generates the read-only data snapshot used by the GitHub Pages build.
// Starts the built server against a scratch database, walks every public
// read endpoint, and writes the JSON to dist/public/data/.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { snapshotFile } from "../shared/snapshot";

const PORT = 5077;
const OUT = path.resolve("dist/public/data");
const DB = process.env.LATE_ICE_DB || path.resolve("dist/snapshot.db");

async function main() {
  await mkdir(OUT, { recursive: true });
  const srv = spawn("node", ["dist/index.cjs"], { env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), LATE_ICE_DB: DB }, stdio: "inherit" });
  const base = `http://localhost:${PORT}`;
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${base}/api/bootstrap`); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  const seen = new Set<string>();
  const get = async (p: string) => {
    if (seen.has(p)) return null;
    seen.add(p);
    const res = await fetch(base + p);
    if (!res.ok) return null;
    const json = await res.json();
    await writeFile(path.join(OUT, snapshotFile(p)), JSON.stringify(json));
    return json;
  };
  const boot = await get("/api/bootstrap");
  await get("/api/feed");
  await get("/api/players");
  await get("/api/rink");
  await get("/api/samples");
  const seasons: any[] = boot.seasons;
  for (const l of boot.leagues) {
    await get(`/api/feed?league=${l.id}`);
    await get(`/api/players?league=${l.id}`);
    const lg = await get(`/api/leagues/${l.id}`);
    for (const s of lg?.seasons ?? []) await get(`/api/leagues/${l.id}?season=${s.id}`);
    for (const t of l.teams) {
      const team = await get(`/api/teams/${t.id}`);
      for (const p of team?.roster ?? []) await get(`/api/players/${p.id}`);
      for (const g of team?.games ?? []) await get(`/api/games/${g.id}`);
    }
  }
  void seasons;
  await writeFile(path.join(OUT, "snapshot.json"), JSON.stringify({ generatedAt: new Date().toISOString(), files: seen.size }));
  srv.kill();
  console.log(`snapshot: ${seen.size} files -> ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
