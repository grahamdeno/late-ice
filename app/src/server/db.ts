import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import postgres from "postgres";

// Per-request query count. Active only when LATEICE_COUNT_QUERIES=1, and only
// inside a request that opted in (so scripts and the nightly job stay quiet).
const querySlots = new AsyncLocalStorage<{ n: number }>();

export function runWithQueryCount<T>(fn: () => Promise<T>): Promise<T> {
  if (process.env.LATEICE_COUNT_QUERIES !== "1") return fn();
  return querySlots.run({ n: 0 }, fn);
}

/** How many q/one calls this request has made, or null when counting is off. */
export function currentQueryCount(): number | null {
  const slot = querySlots.getStore();
  return slot ? slot.n : null;
}

function noteQuery() {
  if (process.env.LATEICE_COUNT_QUERIES !== "1") return;
  const slot = querySlots.getStore();
  if (slot) slot.n += 1;
}

// One pooled client per server instance. On Vercel, DATABASE_URL should be the
// Supabase pooler in transaction mode (port 6543), which needs prepare: false.
const g = globalThis as unknown as { __lateIceSql?: postgres.Sql };

function make() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  // Strip Prisma-style flags (pgbouncer=true, connection_limit) that Postgres itself would reject.
  const u = new URL(raw);
  for (const k of ["pgbouncer", "connection_limit", "pool_timeout"]) u.searchParams.delete(k);
  const url = u.toString();
  return postgres(url, {
    prepare: false,
    max: Number(process.env.PG_POOL_MAX || 5),
    idle_timeout: 20,
    // Counts, sums and averages come back as plain numbers, not strings.
    types: ({
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    }) as any,
    onnotice: () => {},
  });
}

export const sql: postgres.Sql = g.__lateIceSql ?? (g.__lateIceSql = make());
export type Tx = postgres.Sql | postgres.TransactionSql;

/** One round trip. Both q and one count a single query (one does not call q). */
async function exec<T = any>(db: Tx, text: string, params: any[] = []): Promise<T[]> {
  noteQuery();
  return (await db.unsafe(text, params)) as unknown as T[];
}

/** Rows as plain objects. */
export async function q<T = any>(db: Tx, text: string, params: any[] = []): Promise<T[]> {
  return exec<T>(db, text, params);
}
export async function one<T = any>(db: Tx, text: string, params: any[] = []): Promise<T | undefined> {
  const r = await exec<T>(db, text, params);
  return r[0];
}
