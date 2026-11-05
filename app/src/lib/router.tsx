"use client";
// Small shim so views written for wouter run on the Next.js router.
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, type ComponentProps } from "react";

export function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink {...props} />;
}

export function useLocation(): [string, (to: string) => void] {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const go = useCallback((to: string) => router.push(to), [router]);
  return [pathname, go];
}
