// The app icon, drawn rather than dragged in.
//
//   node desktop/icons/make-icon.mjs
//
// The mark is the astrolabe in shared/brandMark.ts — the mater, the throne,
// the rete's rings, the alidade with its two pointers, one star on the rete —
// rasterised here from THE SAME NUMBERS (BRAND_MARK is imported, not copied),
// in gold leaf `#e3b341` on graphite `#0d1117`, the product's two colours,
// set in a rounded square. An icon is the one surface a reader sees before
// any stylesheet loads, so it is those two colours and nothing else.
//
// Written as a generator, and checked in beside its output, because a binary
// nobody can regenerate is a binary nobody can change: when the geometry
// moves in brandMark.ts, this is one command rather than a design tool
// nobody has. No dependencies: a PNG is a zlib stream in four chunks, and
// `node:zlib` is already here. The coverage functions are the SVG's shapes
// as distance fields — an annulus is |d − r| ≤ w/2 — supersampled 3×3, which
// is what the browser does to the same SVG with more ceremony.

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BRAND_MARK } from "../../shared/brandMark.ts";

const SIZE = 512;
const BG = [0x0d, 0x11, 0x17]; // graphite
const GOLD = [0xe3, 0xb3, 0x41]; // gold leaf, at GitHub's attention-yellow pitch
const RADIUS = SIZE * 0.22; // the corner radius of the app's own `--radius`, scaled
// The 100×100 drawing sits in the plate with the same air the favicon gives
// it: 12 units of margin, so the throne does not touch the top edge.
const SCALE = (SIZE * 0.76) / 100;
const OFFSET = SIZE * 0.12;

const rad = (deg) => (deg * Math.PI) / 180;
const P = (x, y) => [OFFSET + x * SCALE, OFFSET + y * SCALE];
const C = P(BRAND_MARK.centre.x, BRAND_MARK.centre.y);
const polar = (angle, r) => [C[0] + Math.cos(rad(angle)) * r * SCALE, C[1] + Math.sin(rad(angle)) * r * SCALE];

/** Coverage of a rounded square at (x, y), antialiased by 3× supersampling. */
function plate(x, y) {
  let hits = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const px = x + (sx + 0.5) / 3;
      const py = y + (sy + 0.5) / 3;
      const dx = Math.max(RADIUS - px, px - (SIZE - RADIUS), 0);
      const dy = Math.max(RADIUS - py, py - (SIZE - RADIUS), 0);
      if (Math.hypot(dx, dy) <= RADIUS) hits++;
    }
  }
  return hits / 9;
}

// ── The mark as distance fields ────────────────────────────────────────────

const rings = [
  { c: C, r: BRAND_MARK.mater.r * SCALE, w: BRAND_MARK.mater.width * SCALE },
  { c: P(BRAND_MARK.throne.x, BRAND_MARK.throne.y), r: BRAND_MARK.throne.r * SCALE, w: BRAND_MARK.throne.width * SCALE },
  ...BRAND_MARK.rete.map((ring) => ({ c: C, r: ring.r * SCALE, w: ring.width * SCALE })),
];
const A = BRAND_MARK.alidade;
const alidadeEnds = [polar(A.angle, A.length), polar(A.angle + 180, A.length)];
const alidadeWidth = A.width * SCALE;
// The pointers: a triangle past each end, its base as wide as the rule.
function pointer(angle) {
  const base = polar(angle, A.length);
  const tip = polar(angle, A.length + A.pointer);
  const ux = -Math.sin(rad(angle)) * A.width * SCALE;
  const uy = Math.cos(rad(angle)) * A.width * SCALE;
  return [[base[0] + ux, base[1] + uy], tip, [base[0] - ux, base[1] - uy]];
}
const pointers = [pointer(A.angle), pointer(A.angle + 180)];
const hub = { c: C, r: A.width * 0.9 * SCALE };
const S = BRAND_MARK.star;
const starAt = polar(S.angle, S.radius);
const starSize = S.size * SCALE;

function inRing(px, py, ring) {
  return Math.abs(Math.hypot(px - ring.c[0], py - ring.c[1]) - ring.r) <= ring.w / 2;
}
function nearSegment(px, py, [a, b], halfWidth) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (a[0] + vx * t), py - (a[1] + vy * t)) <= halfWidth;
}
function inTriangle(px, py, [a, b, c]) {
  const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const d1 = s([px, py], a, b), d2 = s([px, py], b, c), d3 = s([px, py], c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
/** The ✦ on the rete: |x|^p + |y|^p ≤ 1 with p < 1 is the concave star. */
function inStar(px, py) {
  const dx = Math.abs(px - starAt[0]) / starSize;
  const dy = Math.abs(py - starAt[1]) / starSize;
  return dx ** 0.45 + dy ** 0.45 <= 1;
}

/** Coverage of the whole mark at (x, y), 3× supersampled. */
function mark(x, y) {
  let hits = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const px = x + (sx + 0.5) / 3;
      const py = y + (sy + 0.5) / 3;
      const on =
        rings.some((ring) => inRing(px, py, ring)) ||
        nearSegment(px, py, alidadeEnds, alidadeWidth / 2) ||
        pointers.some((tri) => inTriangle(px, py, tri)) ||
        Math.hypot(px - hub.c[0], py - hub.c[1]) <= hub.r ||
        inStar(px, py);
      if (on) hits++;
    }
  }
  return hits / 9;
}

const rows = [];
for (let y = 0; y < SIZE; y++) {
  const row = Buffer.alloc(1 + SIZE * 4);
  row[0] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    const onPlate = plate(x, y);
    // A faint radial lift toward the centre, at most ~7% of the gold mixed
    // into the ground: the face of an instrument catches light in the middle.
    const d = Math.hypot(x - SIZE / 2, y - SIZE / 2) / (SIZE / 2);
    const lift = Math.max(0, 1 - d * 1.15) ** 2 * 0.07;
    const ink = BG.map((c, i) => c + (GOLD[i] - c) * lift);
    const lit = mark(x, y);
    const rgb = ink.map((c, i) => Math.round(c + (GOLD[i] - c) * lit));
    const at = 1 + x * 4;
    row[at] = rgb[0];
    row[at + 1] = rgb[1];
    row[at + 2] = rgb[2];
    row[at + 3] = Math.round(onPlate * 255);
  }
  rows.push(row);
}

// ── PNG container ──────────────────────────────────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = fileURLToPath(new URL("./icon.png", import.meta.url));
writeFileSync(out, png);
console.log(`icon: ${out} (${SIZE}×${SIZE}, ${(png.length / 1024).toFixed(1)} kB)`);
