import "server-only";
// Nightly backup: every table as JSON, gzipped, into a private storage bucket. Keeps 30 days.
// Restore: script/restore-backup.mjs (reads one file back into an empty database).
import { gzipSync } from "node:zlib";
import { q, sql } from "./db";
import { supabaseAdmin } from "./supabase";

export const BACKUP_BUCKET = "backups";
const KEEP_DAYS = 30;

export async function runBackup() {
  const sb = supabaseAdmin();
  const { data: buckets } = await sb.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BACKUP_BUCKET)) await sb.storage.createBucket(BACKUP_BUCKET, { public: false });
  const tables = (await q<{ t: string }>(sql,
    "SELECT table_name t FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).map((r) => r.t);
  const dump: Record<string, unknown[]> = {};
  let rows = 0;
  for (const t of tables) {
    const r = await q<any>(sql, `SELECT * FROM public."${t.replace(/"/g, "")}"`);
    dump[t] = r;
    rows += r.length;
  }
  const day = new Date().toISOString().slice(0, 10);
  const body = gzipSync(Buffer.from(JSON.stringify({ version: 1, at: new Date().toISOString(), tables: dump })));
  const { error } = await sb.storage.from(BACKUP_BUCKET).upload(`${day}.json.gz`, body, { contentType: "application/gzip", upsert: true });
  if (error) throw new Error(`backup upload failed: ${error.message}`);
  // Drop backups older than the window.
  const { data: files } = await sb.storage.from(BACKUP_BUCKET).list("", { limit: 200 });
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  const old = (files ?? []).map((f) => f.name).filter((n) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(n) && n.slice(0, 10) < cutoff);
  if (old.length) await sb.storage.from(BACKUP_BUCKET).remove(old);
  return { file: `${day}.json.gz`, tables: tables.length, rows, bytes: body.length, removed: old.length };
}
