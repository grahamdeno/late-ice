import "server-only";
import postgres from "postgres";

// One pooled client per server instance. On Vercel, DATABASE_URL should be the
// Supabase pooler in transaction mode (port 6543), which needs prepare: false.
const g = globalThis as unknown as { __lateIceSql?: postgres.Sql };

function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
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

/** Rows as plain objects. */
export async function q<T = any>(db: Tx, text: string, params: any[] = []): Promise<T[]> {
  return (await db.unsafe(text, params)) as unknown as T[];
}
export async function one<T = any>(db: Tx, text: string, params: any[] = []): Promise<T | undefined> {
  const r = await q<T>(db, text, params);
  return r[0];
}
