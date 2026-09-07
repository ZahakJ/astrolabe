// The mark: an astrolabe, face on.
//
// One drawing, as geometry, used everywhere the product shows its face — the
// sidebar's wordmark, the sign-in modal, the favicon, the tour's first card,
// the landing page, the README banner, the manual's top bar, and (ported to a
// rasteriser in desktop/icons/make-icon.mjs) the app icon. The parts are the
// instrument's own: the MATER, the heavy outer ring that is the body; the
// THRONE, the small ring at the top it hung from; the RETE, the pierced star
// map of thin rings that turned over the face; the ALIDADE, the sighting rule
// pivoted at the centre with a pointer at each end; and one star point on
// the rete, because a rete is a star map and a map with no star is a wheel.
//
// Everything is stroke in `currentColor` on nothing, so the same string is
// gold on graphite in the app and gold on graphite on paper. "Small" drops
// the inner ring and the star, which at sixteen pixels are noise.
//
// The ✦ that decorates the product elsewhere (the published star in the tree,
// the tracker's flourish at 100%, the blog's back-to-top) is an ornament, not
// the mark, and stays a ✦.

export const BRAND_MARK_VIEWBOX = "0 0 100 100";

/** The instrument's parts in a 100×100 box. Exported so the icon rasteriser
 *  draws exactly these circles and this rule rather than a hand copy. */
export const BRAND_MARK = {
  centre: { x: 50, y: 55 },
  mater: { r: 40, width: 4 },
  throne: { x: 50, y: 9, r: 5, width: 2.6 },
  rete: [
    { r: 28, width: 1.6 },
    { r: 16, width: 1.6 },
  ],
  /** The alidade runs across the face at this angle, from rim to rim. */
  alidade: { angle: -40, length: 33, width: 2.8, pointer: 7 },
  /** One star on the outer rete ring, at this angle from the centre. */
  star: { angle: -48, radius: 28, size: 4.2 },
} as const;

const rad = (deg: number): number => (deg * Math.PI) / 180;

function polar(angle: number, radius: number): { x: number; y: number } {
  return { x: BRAND_MARK.centre.x + Math.cos(rad(angle)) * radius, y: BRAND_MARK.centre.y + Math.sin(rad(angle)) * radius };
}

/** A four-pointed star (an astroid, the ✦'s own curve) as a path. */
function starPath(cx: number, cy: number, size: number): string {
  const k = size * 0.28; // how far the concave sides pull in
  const pts: string[] = [];
  for (let i = 0; i < 4; i++) {
    const a = rad(i * 90 - 90);
    const b = rad(i * 90 - 45);
    pts.push(`${i === 0 ? "M" : "L"}${(cx + Math.cos(a) * size).toFixed(2)} ${(cy + Math.sin(a) * size).toFixed(2)}`);
    pts.push(`Q${cx.toFixed(2)} ${cy.toFixed(2)} ${(cx + Math.cos(b) * k).toFixed(2)} ${(cy + Math.sin(b) * k).toFixed(2)}`);
  }
  return pts.join(" ") + " Z";
}

export interface BrandMarkOptions {
  /** Rendered size in CSS px (width = height). Default 24. */
  size?: number;
  /** "small" for anything under ~20px: fewer rings, no star. Default by size. */
  detail?: "full" | "small";
  /** Stroke colour. Default `currentColor`. */
  color?: string;
  /** A class on the <svg>. */
  className?: string;
  /** An accessible name; without one the mark is aria-hidden decoration. */
  title?: string;
}

/** The mark as an SVG string. */
export function brandMarkSvg(opts: BrandMarkOptions = {}): string {
  const size = opts.size ?? 24;
  const detail = opts.detail ?? (size < 20 ? "small" : "full");
  const color = opts.color ?? "currentColor";
  const { centre, mater, throne, rete, alidade, star } = BRAND_MARK;
  const a1 = polar(alidade.angle, alidade.length);
  const a2 = polar(alidade.angle + 180, alidade.length);
  // The pointers: a short triangle past each end of the rule, pointing out.
  const tip = (_end: { x: number; y: number }, angle: number): string => {
    const p = polar(angle, alidade.length + alidade.pointer);
    const left = polar(angle, alidade.length);
    const ux = -Math.sin(rad(angle)) * alidade.width;
    const uy = Math.cos(rad(angle)) * alidade.width;
    return `M${(left.x + ux).toFixed(2)} ${(left.y + uy).toFixed(2)} L${p.x.toFixed(2)} ${p.y.toFixed(2)} L${(left.x - ux).toFixed(2)} ${(left.y - uy).toFixed(2)} Z`;
  };
  const rings = (detail === "full" ? rete : rete.slice(0, 1))
    .map((ring) => `<circle cx="${centre.x}" cy="${centre.y}" r="${ring.r}" stroke-width="${ring.width}"/>`)
    .join("");
  const s = polar(star.angle, star.radius);
  const starEl = detail === "full" ? `<path d="${starPath(s.x, s.y, star.size)}" fill="${color}" stroke="none"/>` : "";
  const label = opts.title ? `<title>${opts.title}</title>` : "";
  const aria = opts.title ? 'role="img"' : 'aria-hidden="true"';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BRAND_MARK_VIEWBOX}" width="${size}" height="${size}"` +
    ` fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" ${aria}${opts.className ? ` class="${opts.className}"` : ""}>` +
    label +
    `<circle cx="${throne.x}" cy="${throne.y}" r="${throne.r}" stroke-width="${throne.width}"/>` +
    `<circle cx="${centre.x}" cy="${centre.y}" r="${mater.r}" stroke-width="${mater.width}"/>` +
    rings +
    `<path d="M${a1.x.toFixed(2)} ${a1.y.toFixed(2)} L${a2.x.toFixed(2)} ${a2.y.toFixed(2)}" stroke-width="${alidade.width}"/>` +
    `<path d="${tip(a1, alidade.angle)} ${tip(a2, alidade.angle + 180)}" fill="${color}" stroke="none"/>` +
    `<circle cx="${centre.x}" cy="${centre.y}" r="${alidade.width * 0.9}" fill="${color}" stroke="none"/>` +
    starEl +
    `</svg>`
  );
}

/** The mark on a plate, as a data: URL — the favicon, and anything that wants
 *  a picture rather than markup. `bg` and `gold` are hex colours. */
export function brandMarkDataUrl(bg = "#0d1117", gold = "#e3b341"): string {
  const inner = brandMarkSvg({ size: 64, detail: "small", color: gold })
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="64" height="64">` +
    `<rect width="100" height="100" rx="22" fill="${bg}"/>` +
    `<g transform="translate(12 12) scale(0.76)" fill="none" stroke="${gold}" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
