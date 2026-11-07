"use client";
import { useEffect, useState } from "react";

export type Theme = "auto" | "light" | "dark";
const KEY = "lateice.theme";

/** Appearance for this device: follow the phone, or always light, or always dark. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState<Theme>("auto");
  useEffect(() => {
    try { const t = localStorage.getItem(KEY); if (t === "light" || t === "dark") set(t); } catch { /* storage off */ }
  }, []);
  const choose = (t: Theme) => {
    set(t);
    try { if (t === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* storage off */ }
    if (t === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };
  return [theme, choose];
}
