#!/usr/bin/env node
// Every raster the APK ships, drawn from one geometry.
//
// The mark is the ASTROLABE from shared/brandMark.ts — the same rings, rule
// and star the web client's wordmark, the favicon and the desktop icon draw —
// in gold on graphite. It used to be a four-pointed star drawn here by hand;
// since the rename every surface takes the one geometry, so the launcher
// cannot drift from the app it launches.
//
//   node icons/make-icons.mjs        (needs ImageMagick's `magick` on PATH)
//
// Checked-in output, deliberately: android/app/src/main/res/**. This runs when
// the mark changes, not on every build — a build that shells out to ImageMagick
// is a build that fails on a machine without it.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { brandMarkSvg } from "../../shared/brandMark.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const RES = join(HERE, "..", "android", "app", "src", "main", "res");

// The graphite room (client/styles/tokens.css [data-theme="graphite"]).
const GRAPHITE = "#0d1117";
const GOLD = "#e3b341";

/** The mark at `size` px, full detail, in `color`, on transparency. */
function markSvg(color, size) {
  return brandMarkSvg({ size, detail: "full", color });
}

const work = join(tmpdir(), `astrolabe-icons-${process.pid}`);
mkdirSync(work, { recursive: true });

function magick(args) {
  execFileSync("magick", args, { stdio: ["ignore", "ignore", "inherit"] });
}

/** The mark, at `size` px, on transparency. */
function mark(size, out) {
  const svg = join(work, `mark-${size}.svg`);
  writeFileSync(svg, markSvg(GOLD, size));
  magick(["-background", "none", "-density", "384", svg, "-resize", `${size}x${size}`, out]);
}

/** The mark centred on a canvas, with whatever ground is asked for. */
function plate(canvas, markSize, ground, out, mask) {
  const glyph = join(work, `glyph-${markSize}.png`);
  mark(markSize, glyph);
  const args = ["-size", `${canvas}x${canvas}`, ground === null ? "xc:none" : `xc:${ground}`];
  if (mask) args.push(...mask(canvas));
  args.push(glyph, "-gravity", "center", "-composite", out);
  magick(args);
}

/** A rounded square, the shape Android draws a legacy icon into. */
const rounded = (canvas) => {
  const r = Math.round(canvas * 0.22);
  return [
    "(",
    "-size", `${canvas}x${canvas}`, "xc:none",
    "-fill", "white",
    "-draw", `roundrectangle 0,0 ${canvas - 1},${canvas - 1} ${r},${r}`,
    ")",
    "-alpha", "set",
    "-compose", "DstIn", "-composite", "-compose", "Over",
  ];
};

const circle = (canvas) => {
  const c = (canvas - 1) / 2;
  return [
    "(",
    "-size", `${canvas}x${canvas}`, "xc:none",
    "-fill", "white",
    "-draw", `circle ${c},${c} ${c},0`,
    ")",
    "-alpha", "set",
    "-compose", "DstIn", "-composite", "-compose", "Over",
  ];
};

// ── launcher icons ─────────────────────────────────────────────────────────
//
// The adaptive foreground is a 108dp canvas of which the launcher may crop to
// the inner 72dp and mask to any shape it likes. The mark is drawn at 56% of
// the canvas — inside the safe circle at every mask, since the mark's own
// outer ring already sits inside its box.
const LAUNCHER = [
  ["mdpi", 48, 108],
  ["hdpi", 72, 162],
  ["xhdpi", 96, 216],
  ["xxhdpi", 144, 324],
  ["xxxhdpi", 192, 432],
];
for (const [density, legacy, adaptive] of LAUNCHER) {
  const dir = join(RES, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  plate(adaptive, Math.round(adaptive * 0.56), null, join(dir, "ic_launcher_foreground.png"));
  plate(legacy, Math.round(legacy * 0.72), GRAPHITE, join(dir, "ic_launcher.png"), rounded);
  plate(legacy, Math.round(legacy * 0.68), GRAPHITE, join(dir, "ic_launcher_round.png"), circle);
}

// ── vectors ────────────────────────────────────────────────────────────────
//
// Two places want the mark as a VECTOR rather than a bitmap, and both of them
// are the system drawing it for us at a size we do not choose:
//
//   splash_star            — `windowSplashScreenAnimatedIcon` (API 31+), which
//                            Android masks to a circle at 2/3 of the canvas.
//   ic_launcher_monochrome — the themed-icon layer (API 33+), where the
//                            launcher tints a silhouette to the wallpaper's
//                            palette.
//
// A VectorDrawable is SVG's little cousin: paths only, no <circle>. So the
// mark's SVG is read element by element and each circle becomes two arcs.
// The 150-unit viewport is the inset: the mark occupies the middle 100, which
// leaves its outer ring clear of the circular mask instead of shaved by it.
function vectorDrawable(color) {
  const svg = markSvg(color, 100);
  const paths = [];
  const num = (s) => Number(s);
  for (const m of svg.matchAll(/<circle ([^>]*)\/>/g)) {
    const attr = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    const cx = num(attr.cx), cy = num(attr.cy), r = num(attr.r);
    const d = `M${(cx - r).toFixed(2)},${cy.toFixed(2)} a${r},${r} 0 1,0 ${(2 * r).toFixed(2)},0 a${r},${r} 0 1,0 ${(-2 * r).toFixed(2)},0`;
    if (attr.fill && attr.fill !== "none") paths.push(`    <path android:fillColor="${color}" android:pathData="${d}" />`);
    else paths.push(`    <path android:strokeColor="${color}" android:strokeWidth="${attr["stroke-width"]}" android:strokeLineCap="round" android:pathData="${d}" />`);
  }
  for (const m of svg.matchAll(/<path ([^>]*)\/>/g)) {
    const attr = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    if (attr.fill && attr.fill !== "none") paths.push(`    <path android:fillColor="${color}" android:pathData="${attr.d}" />`);
    else paths.push(`    <path android:strokeColor="${color}" android:strokeWidth="${attr["stroke-width"]}" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="${attr.d}" />`);
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED by icons/make-icons.mjs from shared/brandMark.ts. Edit the mark there, not here. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="150"
    android:viewportHeight="150">
  <group android:translateX="25" android:translateY="25">
${paths.join("\n")}
  </group>
</vector>
`;
}

const drawable = join(RES, "drawable");
mkdirSync(drawable, { recursive: true });
writeFileSync(join(drawable, "splash_star.xml"), vectorDrawable(GOLD));
// Flat white: the launcher tints this layer itself, and any colour baked in
// here is a colour it has to fight.
writeFileSync(join(drawable, "ic_launcher_monochrome.xml"), vectorDrawable("#FFFFFF"));

rmSync(work, { recursive: true, force: true });
console.log("icons: launcher + splash + vectors written to android/app/src/main/res");
