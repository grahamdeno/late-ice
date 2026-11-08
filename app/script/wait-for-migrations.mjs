// Production builds wait until every migration file in this commit is applied to the database.
// The "Database migrations" workflow runs on the same push, backs up first, then applies them.
// Without this wait, new code can go live a few minutes before its columns exist.
//
// - Runs only for Vercel production builds that can see DATABASE_URL.
// - If the database can't be reached or doesn't track migrations, it warns and lets the build go on.
// - If migrations are still missing after the time limit, it fails the build. Vercel then keeps
//   serving the previous deployment, which still matches the database.
import { readdirSync } from "node:fs";

const LIMIT_MS = Number(process.env.WAIT_FOR_MIGRATIONS_MS ?? 10 * 60 * 1000);
const EVERY_MS = 10 * 1000;

if (process.env.VERCEL_ENV !== "production" || !process.env.DATABASE_URL) {
  console.log("wait-for-migrations: not a production build with a database, skipping.");
  process.exit(0);
}

const wanted = readdirSync(new URL("../supabase/migrations/", import.meta.url))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.split("_")[0]);

const { default: postgres } = await import("postgres");
const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 5, connect_timeout: 20, prepare: false });
const started = Date.now();
try {
  for (;;) {
    let applied;
    try {
      applied = new Set((await sql`select version from supabase_migrations.schema_migrations`).map((r) => r.version));
    } catch (e) {
      console.warn(`wait-for-migrations: could not read migration history (${e?.code ?? e?.message}); continuing.`);
      process.exit(0);
    }
    const missing = wanted.filter((v) => !applied.has(v));
    if (!missing.length) {
      console.log(`wait-for-migrations: all ${wanted.length} migrations applied.`);
      process.exit(0);
    }
    if (Date.now() - started > LIMIT_MS) {
      console.error(`wait-for-migrations: still missing after ${Math.round(LIMIT_MS / 1000)}s: ${missing.join(", ")}. Failing the build so the old deployment stays live.`);
      process.exit(1);
    }
    console.log(`wait-for-migrations: waiting on ${missing.length} migration(s): ${missing.join(", ")}`);
    await new Promise((r) => setTimeout(r, EVERY_MS));
  }
} finally {
  await sql.end({ timeout: 2 }).catch(() => {});
}
