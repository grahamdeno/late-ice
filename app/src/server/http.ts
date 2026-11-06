import "server-only";
import { NextResponse } from "next/server";
import { HttpError } from "./services";
import { userFromRequest } from "./accounts";

export type Ctx<P = Record<string, string>> = { params: Promise<P> };

/**
 * Per-user write limit. In memory, per server instance, not shared across instances.
 * 60 non-GET requests a minute for a signed-in user. Anonymous requests are not counted.
 * At most 2,000 users are tracked. The least recently seen user is dropped past that,
 * which resets their count. Each user keeps at most 60 timestamps.
 */
const WRITE_LIMIT = 60;
const WRITE_WINDOW_MS = 60_000;
const WRITE_MAX_USERS = 2_000;
const writeHits = new Map<number, number[]>();

export function allowUserWrite(userId: number, now = Date.now()) {
  const cut = now - WRITE_WINDOW_MS;
  let hits = (writeHits.get(userId) ?? []).filter((t) => t > cut);
  if (hits.length >= WRITE_LIMIT) {
    writeHits.delete(userId);
    writeHits.set(userId, hits);
    while (writeHits.size > WRITE_MAX_USERS) {
      const oldest = writeHits.keys().next().value;
      if (oldest === undefined) break;
      writeHits.delete(oldest);
    }
    return false;
  }
  hits = [...hits, now];
  writeHits.delete(userId);
  writeHits.set(userId, hits);
  while (writeHits.size > WRITE_MAX_USERS) {
    const oldest = writeHits.keys().next().value;
    if (oldest === undefined) break;
    writeHits.delete(oldest);
  }
  return true;
}

const isWrite = (method: string) => method !== "GET" && method !== "HEAD" && method !== "OPTIONS";

/** Wrap a route handler: JSON errors with the right status, no stack traces to the client. */
export function handle<P = Record<string, string>>(fn: (req: Request, params: P) => Promise<Response | unknown>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      if (isWrite(req.method || "GET")) {
        const u = await userFromRequest(req);
        if (u && !allowUserWrite(u.id)) throw new HttpError(429, "Too many saves. Wait a minute and try again.");
      }
      const params = ctx?.params ? await ctx.params : ({} as P);
      const out = await fn(req, params);
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (e: any) {
      if (e instanceof HttpError) return NextResponse.json({ message: e.message, ...e.extra }, { status: e.status });
      console.error(e);
      return NextResponse.json({ message: "Something went wrong on the server." }, { status: 500 });
    }
  };
}

export async function body<T = any>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}

export const num = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, "Bad id");
  return n;
};
