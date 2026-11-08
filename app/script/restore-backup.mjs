// Restore a nightly backup into a database whose tables exist and are EMPTY (run the migrations first).
// Usage: DATABASE_URL=... node script/restore-backup.mjs 2026-11-06.json.gz
// The file comes from the private "backups" bucket in Supabase Storage.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import postgres from "postgres";

const file = process.argv[2];
if (!file || !process.env.DATABASE_URL) { console.error("usage: DATABASE_URL=... node script/restore-backup.mjs <file.json.gz>"); process.exit(1); }
const dump = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));
const db = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
await db.begin(async (tx) => {
  await tx.unsafe("SET session_replication_role = replica"); // skip foreign-key checks while loading
  for (const [table, rows] of Object.entries(dump.tables)) {
    if (!rows.length) continue;
    const n = (await tx.unsafe(`SELECT COUNT(*)::int n FROM public."${table}"`))[0].n;
    if (n) throw new Error(`${table} isn't empty; restore only into an empty database`);
    for (const r of rows) await tx`INSERT INTO ${tx(table)} ${tx(r)}`;
    await tx.unsafe(`SELECT setval(pg_get_serial_sequence('public."${table}"','id'), COALESCE((SELECT MAX(id) FROM public."${table}"),1)) WHERE pg_get_serial_sequence('public."${table}"','id') IS NOT NULL`).catch(() => {});
    console.log(`${table}: ${rows.length}`);
  }
});
await db.end();
console.log(`restored ${file} (taken ${dump.at})`);
