"use client";
// Small shim so views written for wouter run on the Next.js router.
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, type ComponentProps } from "react";

export function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink {...props} />;
}

/**
 * The screens visited in this tab, so Back returns where the person came from instead of a fixed
 * parent. Kept in sessionStorage: a deep link or a fresh tab starts empty, and Back then falls
 * back to the screen's parent. A step that finishes a flow (signing in, confirming a sheet,
 * deleting something) replaces its screen, so Back never lands on a form that's already done.
 */
const TRAIL = "late-ice-trail";
let replaceNext = false;
function readTrail(): string[] {
  try { return JSON.parse(sessionStorage.getItem(TRAIL) || "[]"); } catch { return []; }
}
function writeTrail(t: string[]) {
  try { sessionStorage.setItem(TRAIL, JSON.stringify(t.slice(-60))); } catch { /* private mode: Back uses the parent */ }
}
export function useNavTrail() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    const t = readTrail();
    if (t[t.length - 1] === pathname) { replaceNext = false; return; }
    if (replaceNext && t.length) t[t.length - 1] = pathname;
    else if (t.length > 1 && t[t.length - 2] === pathname) t.pop();
    else t.push(pathname);
    replaceNext = false;
    writeTrail(t);
  }, [pathname]);
}
/** True when the previous screen in this tab was in Late Ice, so history back stays in the app. */
export function canGoBack() {
  return readTrail().length > 1;
}

export function useLocation(): [string, (to: string) => void, (to: string) => void] {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const go = useCallback((to: string) => router.push(to), [router]);
  const swap = useCallback((to: string) => { replaceNext = true; router.replace(to); }, [router]);
  return [pathname, go, swap];
}

/** Back: the screen the person came from; with no in-app history, the given parent. */
export function useBack(fallback: string) {
  const router = useRouter();
  return useCallback(() => { if (canGoBack()) router.back(); else router.push(fallback); }, [router, fallback]);
}
