// Color contrast of the theme tokens, computed from globals.css. WCAG AA: 4.5:1 for text.
// Checks the text colors on every surface they sit on, and on a team-tinted hero card for a spread of team colors.
// Run alone: node script/contrast.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const hex = (c) => { const x = c.replace("#", ""); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); };
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, p) => a.map((v, i) => Math.round(v * p + b[i] * (1 - p)));

/** Variables declared in the block that starts at `start` (the first line holding the selector). */
function block(css, selector) {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`no ${selector} block in globals.css`);
  const body = css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i));
  const vars = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const TEAM_COLORS = ["#000000", "#ffffff", "#f2c200", "#ffeb3b", "#ff7a00", "#1d64c4", "#e0262b", "#0f7f52", "#7a2bd1", "#00e5ff", "#39ff14", "#ff69b4"];

export function contrastProblems(css = readFileSync(fileURLToPath(new URL("../src/app/globals.css", import.meta.url)), "utf8")) {
  const out = [];
  const themes = {
    dark: block(css, ":root {"),
    light: block(css, ':root[data-theme="light"]'),
    "light (phone setting)": block(css, ':root:not([data-theme="dark"])'),
  };
  const need = (theme, what, r, min = 4.5) => { if (r < min) out.push(`${theme}: ${what} is ${r.toFixed(2)}:1, needs ${min}:1`); };
  for (const [name, v] of Object.entries(themes)) {
    const surface = hex(v.surface), ice = hex(v.ice), ice3 = hex(v["ice-3"]);
    const redDim = mix(hex(v["red-btn"]), surface, 0.12);
    for (const k of ["up", "down", "amber", "blue", "mute"]) {
      const fg = hex(v[k]);
      need(name, `${k} text on a card`, ratio(fg, surface));
      need(name, `${k} text on the page`, ratio(fg, ice));
      if (["up", "down", "amber"].includes(k)) {
        need(name, `${k} text on its own 15% tint (In, Late, Out buttons)`, ratio(fg, mix(fg, surface, 0.15)));
        need(name, `${k} text on the soft red panel`, ratio(fg, redDim));
      }
    }
    need(name, "button text on the red button", ratio([255, 255, 255], hex(v["red-btn"])));
    need(name, "text on a ghost button", ratio(hex(v.white), ice3));
    const mixPct = parseFloat(v["hero-mix"]) / 100;
    for (const team of TEAM_COLORS) {
      const hero = mix(hex(team), ice, mixPct);
      for (const [label, key] of [["links", "hero-blue"], ["muted text", "hero-mute"], ["up", "hero-up"], ["down", "hero-down"], ["late", "hero-amber"]]) {
        if (v[key]) need(name, `${label} on a ${team} game card`, ratio(hex(v[key]), hero));
        else out.push(`${name}: missing --${key}`);
      }
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = contrastProblems();
  if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
  console.log("contrast ok");
}
