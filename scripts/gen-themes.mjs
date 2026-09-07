// The preset rooms: the palettes editors and terminals already agree on.
//
//   node scripts/gen-themes.mjs
//
// Writes the `[data-theme="…"]` blocks and the swatch trios for every palette
// in PRESETS into client/styles/tokens.css, between the two marker comments,
// from ONE compact spec per palette: the grounds, the four text tones, the
// accent, and the palette's own eight colours, which the callouts and the
// syntax highlighting are dealt from the way the palette's authors deal them.
// Everything the contrast gate holds a room to (scripts/check-contrast.mjs) is
// measured here first, and a tone that would fail is nudged toward the text
// until it passes, so the generated CSS is the gate's answer and not a guess.
//
// The owner: "copy some of the common themes used in obsidian/vscode like
// atom and nord and all those". These are those, from their published specs,
// under the names people know them by. A room's identity is its GROUNDS as
// much as its accent: the sidebar, the tab strip and the panels stand on
// `--bg-raised`, which these palettes set DARKER than the page the way their
// editors do, so a Dracula room reads as Dracula from the first glance and
// not as "another dark theme with a purple link".

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contrastRatio, deltaE } from "../shared/contrast.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS = path.join(root, "client", "styles", "tokens.css");

/** id, group, grounds, tones, accent, danger, radius, and the eight colours:
 *  red, orange, yellow, green, cyan, blue, purple, pink (pink may repeat). */
export const PRESETS = [
  // ── dark ──────────────────────────────────────────────────────────────
  { id: "github-dark", group: "dark", bg: "#0d1117", raised: "#161b22", hover: "#21262d", border: "#30363d",
    text: "#e6edf3", muted: "#8b949e", faint: "#6e7681", heading: "#e6edf3", accent: "#58a6ff", danger: "#f85149", radius: "6px",
    c: ["#f85149", "#f0883e", "#d29922", "#3fb950", "#39c5cf", "#58a6ff", "#a371f7", "#db61a2"] },
  { id: "nord", group: "dark", bg: "#2e3440", raised: "#272c36", hover: "#3b4252", border: "#4c566a",
    text: "#eceff4", muted: "#d8dee9", faint: "#8791a5", heading: "#e5e9f0", accent: "#88c0d0", danger: "#bf616a", radius: "4px",
    c: ["#bf616a", "#d08770", "#ebcb8b", "#a3be8c", "#88c0d0", "#81a1c1", "#b48ead", "#b48ead"] },
  { id: "dracula", group: "dark", bg: "#282a36", raised: "#21222c", hover: "#343746", border: "#44475a",
    text: "#f8f8f2", muted: "#bfc2cf", faint: "#7a86b8", heading: "#f8f8f2", accent: "#bd93f9", danger: "#ff5555", radius: "6px",
    c: ["#ff5555", "#ffb86c", "#f1fa8c", "#50fa7b", "#8be9fd", "#8be9fd", "#bd93f9", "#ff79c6"] },
  { id: "one-dark", group: "dark", bg: "#282c34", raised: "#21252b", hover: "#2c313a", border: "#3e4451",
    text: "#abb2bf", muted: "#9199a6", faint: "#6b7385", heading: "#d7dae0", accent: "#61afef", danger: "#e06c75", radius: "4px",
    c: ["#e06c75", "#d19a66", "#e5c07b", "#98c379", "#56b6c2", "#61afef", "#c678dd", "#c678dd"] },
  { id: "solarized-dark", group: "dark", bg: "#002b36", raised: "#00212b", hover: "#073642", border: "#0f4a5a",
    text: "#93a1a1", muted: "#839496", faint: "#657b83", heading: "#eee8d5", accent: "#2aa198", danger: "#dc322f", radius: "4px",
    c: ["#dc322f", "#cb4b16", "#b58900", "#859900", "#2aa198", "#268bd2", "#6c71c4", "#d33682"] },
  { id: "gruvbox-dark", group: "dark", bg: "#282828", raised: "#1d2021", hover: "#3c3836", border: "#504945",
    text: "#ebdbb2", muted: "#bdae93", faint: "#928374", heading: "#fbf1c7", accent: "#fe8019", danger: "#fb4934", radius: "3px",
    c: ["#fb4934", "#fe8019", "#fabd2f", "#b8bb26", "#8ec07c", "#83a598", "#d3869b", "#d3869b"] },
  { id: "catppuccin-mocha", group: "dark", bg: "#1e1e2e", raised: "#181825", hover: "#313244", border: "#45475a",
    text: "#cdd6f4", muted: "#a6adc8", faint: "#7f849c", heading: "#cdd6f4", accent: "#cba6f7", danger: "#f38ba8", radius: "8px",
    c: ["#f38ba8", "#fab387", "#f9e2af", "#a6e3a1", "#94e2d5", "#89b4fa", "#cba6f7", "#f5c2e7"] },
  { id: "tokyo-night", group: "dark", bg: "#1a1b26", raised: "#16161e", hover: "#24283b", border: "#3b4261",
    text: "#c0caf5", muted: "#a9b1d6", faint: "#7a82ad", heading: "#c0caf5", accent: "#7aa2f7", danger: "#f7768e", radius: "6px",
    c: ["#f7768e", "#ff9e64", "#e0af68", "#9ece6a", "#7dcfff", "#7aa2f7", "#bb9af7", "#ad8ee6"] },
  { id: "monokai", group: "dark", bg: "#272822", raised: "#1e1f1c", hover: "#3e3d32", border: "#49483e",
    text: "#f8f8f2", muted: "#cfcfc2", faint: "#90908a", heading: "#f8f8f2", accent: "#a6e22e", danger: "#f92672", radius: "3px",
    c: ["#f92672", "#fd971f", "#e6db74", "#a6e22e", "#66d9ef", "#66d9ef", "#ae81ff", "#f92672"] },
  { id: "material-ocean", group: "dark", bg: "#0f111a", raised: "#090b10", hover: "#1f2233", border: "#2a2f45",
    text: "#babed8", muted: "#8f93a2", faint: "#717588", heading: "#eeffff", accent: "#82aaff", danger: "#ff5370", radius: "6px",
    c: ["#ff5370", "#f78c6c", "#ffcb6b", "#c3e88d", "#89ddff", "#82aaff", "#c792ea", "#f07178"] },
  { id: "palenight", group: "dark", bg: "#292d3e", raised: "#222635", hover: "#34394e", border: "#444860",
    text: "#bfc7d5", muted: "#a6accd", faint: "#7c849f", heading: "#eeffff", accent: "#c792ea", danger: "#ff5370", radius: "6px",
    c: ["#ff5370", "#f78c6c", "#ffcb6b", "#c3e88d", "#89ddff", "#82aaff", "#c792ea", "#f07178"] },
  { id: "ayu-dark", group: "dark", bg: "#0b0e14", raised: "#0d1017", hover: "#1b2028", border: "#2d3640",
    text: "#bfbdb6", muted: "#9b9a94", faint: "#6c7079", heading: "#e6e1cf", accent: "#ff8f40", danger: "#f07178", radius: "4px",
    c: ["#f07178", "#ff8f40", "#ffb454", "#aad94c", "#95e6cb", "#59c2ff", "#d2a6ff", "#f29668"] },
  { id: "ayu-mirage", group: "dark", bg: "#1f2430", raised: "#191e2a", hover: "#2a3040", border: "#3e4b59",
    text: "#cccac2", muted: "#a3a29b", faint: "#7c8698", heading: "#d9d7ce", accent: "#73d0ff", danger: "#f28779", radius: "4px",
    c: ["#f28779", "#ffad66", "#ffd173", "#d5ff80", "#95e6cb", "#73d0ff", "#dfbfff", "#f29e74"] },
  { id: "everforest-dark", group: "dark", bg: "#272e33", raised: "#1e2326", hover: "#374145", border: "#414b50",
    text: "#d3c6aa", muted: "#b5b8a8", faint: "#8b9590", heading: "#d3c6aa", accent: "#a7c080", danger: "#e67e80", radius: "6px",
    c: ["#e67e80", "#e69875", "#dbbc7f", "#a7c080", "#83c092", "#7fbbb3", "#d699b6", "#d699b6"] },
  { id: "rose-pine", group: "dark", bg: "#191724", raised: "#1f1d2e", hover: "#26233a", border: "#403d52",
    text: "#e0def4", muted: "#908caa", faint: "#77738f", heading: "#e0def4", accent: "#c4a7e7", danger: "#eb6f92", radius: "8px",
    c: ["#eb6f92", "#f6c177", "#f6c177", "#9ccfd8", "#9ccfd8", "#31748f", "#c4a7e7", "#ebbcba"] },
  { id: "night-owl", group: "dark", bg: "#011627", raised: "#01111d", hover: "#0b2942", border: "#1d3b53",
    text: "#d6deeb", muted: "#a4b1c7", faint: "#6f8290", heading: "#d6deeb", accent: "#82aaff", danger: "#ef5350", radius: "6px",
    c: ["#ef5350", "#f78c6c", "#ecc48d", "#addb67", "#7fdbca", "#82aaff", "#c792ea", "#c792ea"] },
  { id: "kanagawa", group: "dark", bg: "#1f1f28", raised: "#16161d", hover: "#2a2a37", border: "#363646",
    text: "#dcd7ba", muted: "#c8c093", faint: "#7d7c73", heading: "#dcd7ba", accent: "#7e9cd8", danger: "#c34043", radius: "4px",
    c: ["#e46876", "#ffa066", "#c0a36e", "#76946a", "#7aa89f", "#7e9cd8", "#957fb8", "#d27e99"] },
  // ── light ─────────────────────────────────────────────────────────────
  { id: "github-light", group: "light", bg: "#ffffff", raised: "#f6f8fa", hover: "#eaeef2", border: "#d0d7de",
    text: "#1f2328", muted: "#57606a", faint: "#6e7781", heading: "#1f2328", accent: "#0969da", danger: "#cf222e", radius: "6px",
    c: ["#cf222e", "#bc4c00", "#9a6700", "#1a7f37", "#1b7c83", "#0969da", "#8250df", "#bf3989"] },
  { id: "solarized-light", group: "light", bg: "#fdf6e3", raised: "#eee8d5", hover: "#e6dfc8", border: "#d3cbb7",
    text: "#586e75", muted: "#657b83", faint: "#839496", heading: "#073642", accent: "#268bd2", danger: "#dc322f", radius: "4px",
    c: ["#dc322f", "#cb4b16", "#b58900", "#859900", "#2aa198", "#268bd2", "#6c71c4", "#d33682"] },
  { id: "gruvbox-light", group: "light", bg: "#fbf1c7", raised: "#f2e5bc", hover: "#ebdbb2", border: "#d5c4a1",
    text: "#3c3836", muted: "#504945", faint: "#7c6f64", heading: "#282828", accent: "#af3a03", danger: "#9d0006", radius: "3px",
    c: ["#9d0006", "#af3a03", "#b57614", "#79740e", "#427b58", "#076678", "#8f3f71", "#8f3f71"] },
  { id: "catppuccin-latte", group: "light", bg: "#eff1f5", raised: "#e6e9ef", hover: "#dce0e8", border: "#ccd0da",
    text: "#4c4f69", muted: "#5c5f77", faint: "#8c8fa1", heading: "#4c4f69", accent: "#8839ef", danger: "#d20f39", radius: "8px",
    c: ["#d20f39", "#fe640b", "#df8e1d", "#40a02b", "#179299", "#1e66f5", "#8839ef", "#ea76cb"] },
  { id: "ayu-light", group: "light", bg: "#fcfcfc", raised: "#f3f4f5", hover: "#e7e8e9", border: "#d9d9d9",
    text: "#5c6166", muted: "#6b7075", faint: "#8a9199", heading: "#1f2430", accent: "#1e7fcb", danger: "#e65050", radius: "4px",
    c: ["#e65050", "#fa8d3e", "#f2ae49", "#86b300", "#4cbf99", "#399ee6", "#a37acc", "#f07171"] },
  { id: "everforest-light", group: "light", bg: "#fdf6e3", raised: "#f4f0d9", hover: "#efebd4", border: "#ddd8be",
    text: "#5c6a72", muted: "#708089", faint: "#829181", heading: "#5c6a72", accent: "#5f8700", danger: "#f85552", radius: "6px",
    c: ["#f85552", "#f57d26", "#dfa000", "#8da101", "#35a77c", "#3a94c5", "#df69ba", "#df69ba"] },
  { id: "rose-pine-dawn", group: "light", bg: "#faf4ed", raised: "#fffaf3", hover: "#f2e9e1", border: "#dfdad9",
    text: "#575279", muted: "#797593", faint: "#9893a5", heading: "#575279", accent: "#286983", danger: "#b4637a", radius: "8px",
    c: ["#b4637a", "#ea9d34", "#ea9d34", "#286983", "#56949f", "#286983", "#907aa9", "#d7827e"] },
];

// ── colour arithmetic ────────────────────────────────────────────────────────
const hex = (s) => s.replace("#", "").match(/../g).map((h) => parseInt(h, 16));
const toHex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const hue = (s) => {
  const [r, g, b] = hex(s).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(h * 60);
};
const rgba = (s, a) => `rgba(${hex(s).join(", ")}, ${a})`;

/** Nudge `tone` toward `toward` until it clears `min` against every ground. */
function clear(tone, grounds, min, toward) {
  let t = tone;
  for (let i = 0; i < 40 && grounds.some((g) => contrastRatio(t, g) < min); i++) t = mix(t, toward, 0.06);
  return t;
}

function block(p) {
  const dark = p.group === "dark";
  const toward = dark ? "#ffffff" : "#000000";
  const grounds = [p.bg, p.raised, p.hover];
  const text = clear(p.text, grounds, 4.5, toward);
  const muted = clear(p.muted, grounds, 3, toward);
  const faint = clear(p.faint, [p.bg, p.raised], 3, toward);
  const heading = clear(p.heading, grounds, 4.5, toward);
  const accent = clear(p.accent, [p.bg], 4.5, toward);
  // The accent must also be far enough from the body text to read as a link
  // (18 ΔE, shared/contrast.ts). Nudging it would trade the contrast just
  // won, so a palette that fails this is reported and fixed by hand.
  if (deltaE(accent, text) < 18) console.warn(`gen-themes: ${p.id}: accent ${accent} is only ${deltaE(accent, text).toFixed(1)} ΔE from the text`);
  const [red, orange, yellow, green, cyan, blue, purple, pink] = p.c;
  // Callouts and syntax are foreground on the page: hold them to 3:1 too.
  const fg = (c) => clear(c, [p.bg], 3, toward);
  return `[data-theme="${p.id}"] {
  color-scheme: ${p.group};

  --bg: ${p.bg};
  --bg-raised: ${p.raised};
  --bg-hover: ${p.hover};
  --text: ${text};
  --text-muted: ${muted};
  --text-faint: ${faint};
  --heading: ${heading};
  --accent: ${accent};
  --accent-soft: ${rgba(accent, 0.16)};
  --border: ${p.border};
  --danger: ${fg(p.danger)};
  --radius: ${p.radius};

  --selection-bg: ${rgba(accent, 0.28)};
  --focus-ring: ${accent};
  --banner-tint: ${dark ? "62%" : "18%"};
  --banner-hue: ${hue(accent)};

  --graph-node: ${accent};
  --graph-edge: ${mix(p.border, text, 0.15)};
  --graph-vignette: ${dark ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0.08)"};

  --callout-note: ${fg(blue)};
  --callout-info: ${fg(blue)};
  --callout-todo: ${fg(blue)};
  --callout-abstract: ${fg(cyan)};
  --callout-tip: ${fg(cyan)};
  --callout-success: ${fg(green)};
  --callout-question: ${fg(yellow)};
  --callout-warning: ${fg(orange)};
  --callout-failure: ${fg(red)};
  --callout-danger: ${fg(red)};
  --callout-bug: ${fg(red)};
  --callout-example: ${fg(purple)};
  --callout-quote: ${muted};

  --syn-keyword: ${fg(purple)};
  --syn-string: ${fg(green)};
  --syn-number: ${fg(orange)};
  --syn-comment: ${faint};
  --syn-func: ${fg(blue)};
  --syn-type: ${fg(yellow)};
  --syn-prop: ${fg(cyan)};
  --syn-operator: ${muted};
  --syn-tag: ${fg(pink)};
}`;
}

const START = "/* ── generated preset rooms: scripts/gen-themes.mjs — do not edit by hand ── */";
const END = "/* ── end of generated preset rooms ── */";
const SW_START = "  /* ── generated preset swatches: scripts/gen-themes.mjs ── */";
const SW_END = "  /* ── end of generated preset swatches ── */";

let css = readFileSync(TOKENS, "utf8");
const swatches = PRESETS.map((p) => {
  const b = block(p);
  const text = b.match(/--text: (#[0-9a-f]{6})/)[1];
  const accent = b.match(/--accent: (#[0-9a-f]{6})/)[1];
  return `  --swatch-${p.id}-bg: ${p.bg};\n  --swatch-${p.id}-text: ${text};\n  --swatch-${p.id}-accent: ${accent};`;
}).join("\n");
const blocks = PRESETS.map(block).join("\n\n");

function replaceBetween(text, start, end, body, fallbackAnchor) {
  const i = text.indexOf(start);
  if (i >= 0) {
    const j = text.indexOf(end, i);
    if (j < 0) throw new Error(`marker ${end} missing`);
    return text.slice(0, i) + `${start}\n${body}\n${end}` + text.slice(j + end.length);
  }
  const k = text.indexOf(fallbackAnchor);
  if (k < 0) throw new Error(`anchor ${fallbackAnchor} missing`);
  const at = k + fallbackAnchor.length;
  return text.slice(0, at) + `\n${start}\n${body}\n${end}` + text.slice(at);
}

// Swatches go at the end of the hand-written trio list; blocks at the end of the file.
const lastSwatch = css.match(/  --swatch-mauveine-accent: #[0-9a-f]{6};/);
if (!lastSwatch) throw new Error("the swatch list moved");
css = replaceBetween(css, SW_START, SW_END, swatches, lastSwatch[0]);
css = css.replace(/\n+$/, "\n");
css = replaceBetween(css, START, END, blocks, css.trimEnd().slice(-1) === "}" ? css.trimEnd() : css);
writeFileSync(TOKENS, css.replace(/\n{3,}/g, "\n\n"));

// The picker's preview and the palette's dot read a room's trio through
// [data-theme-swatch] / [data-theme-dot] rules in themes.css — one rule per
// id, hand-written for the older rooms; the presets' rules are generated
// beside their tokens so a room can never be listed without a preview.
const THEMES_CSS = path.join(root, "client", "styles", "themes.css");
const RULE_START = "/* ── generated preset swatch rules: scripts/gen-themes.mjs ── */";
const RULE_END = "/* ── end of generated preset swatch rules ── */";
let rules = readFileSync(THEMES_CSS, "utf8");
const body = PRESETS.map((p) => `[data-theme-swatch="${p.id}"],\n[data-theme-dot="${p.id}"] {\n  --sw-bg: var(--swatch-${p.id}-bg);\n  --sw-text: var(--swatch-${p.id}-text);\n  --sw-accent: var(--swatch-${p.id}-accent);\n}`).join("\n\n");
if (rules.includes(RULE_START)) {
  rules = rules.slice(0, rules.indexOf(RULE_START)) + `${RULE_START}\n${body}\n${RULE_END}` + rules.slice(rules.indexOf(RULE_END) + RULE_END.length);
} else {
  rules = rules.replace(/\n+$/, "\n") + `\n${RULE_START}\n${body}\n${RULE_END}\n`;
}
writeFileSync(THEMES_CSS, rules);
console.log(`gen-themes: ${PRESETS.length} rooms written (${PRESETS.filter((p) => p.group === "dark").length} dark, ${PRESETS.filter((p) => p.group === "light").length} light)`);
