import "server-only";
import { NextResponse } from "next/server";
import { HttpError } from "./services";

export type Ctx<P = Record<string, string>> = { params: Promise<P> };

/** Wrap a route handler: JSON errors with the right status, no stack traces to the client. */
export function handle<P = Record<string, string>>(fn: (req: Request, params: P) => Promise<Response | unknown>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
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
