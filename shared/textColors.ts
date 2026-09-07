// The two tiers of text colour, and the arithmetic behind having two.
//
// A colour in a note has to survive TWENTY-ONE rooms — fourteen dark themes
// and seven light ones, each with a `--bg` and a `--bg-raised` — because the note
// outlives the theme it was written under. Ask for AA (4.5:1) on all of them
// at once and the answer is provably empty: against `void`'s `#050508` a text
// colour needs relative luminance ≥ 0.186, against `solar`'s `#ffffff` it
// needs ≤ 0.183. There is no such colour. That is not a tuning problem, it is
// the reason this file has two lists.
//
//   TIER 1, THE DEFAULT — SEMANTIC. The note stores `var(--vc-red)`; the
//   stylesheet resolves it per theme group (client/styles/textcolor.css), so
//   "red" is a light coral on a dark ground and a deep brick on a light one.
//   Every value clears **4.75:1 against every ground in its group** — AA for
//   body text, with margin — and the note carries a MEANING rather than an
//   ink, so the same file reads correctly in iron-gall, in parchment, and in
//   whatever theme arrives later. This is the tier the picker opens
//   on and the one the menu marks as recommended.
//
//   TIER 2 — LITERAL. Sometimes the author means THIS red, and a colour that
//   moves is the wrong answer (a diagram key, a quoted brand, a colour being
//   discussed as itself). These nine hexes are solved against every one of
//   those grounds at once and hold **3:1 everywhere** — WCAG 1.4.11's non-text
//   floor, which is the best a fixed ink can do, as the paragraph above
//   proves. `scripts/check-contrast.mjs` asserts both floors; neither list may
//   be edited without re-running it.
//
// Values are also a SECURITY surface: they end up inside a `style` attribute
// that the sanitizer lets through. Everything here is either a plain hex or a
// `var()` naming a token in `COLOR_TOKENS`, and the sanitizer accepts nothing
// else (client/reading/rawHtml.ts).

/** One swatch. `id` is the i18n key suffix and the CSS token suffix. */
export interface TextColor {
  id: string;
  /** Exactly what is written into the note's `style` attribute. */
  value: string;
  /** A ground-independent hex for drawing the swatch in the menu itself —
   *  a chip painted in `var()` would be invisible in the theme that dims it. */
  swatchDark: string;
  swatchLight: string;
}

/** Tier 1. Values resolve through client/styles/textcolor.css. */
export const SEMANTIC_COLORS: TextColor[] = [
  { id: "red", value: "var(--vc-red)", swatchDark: "#e79b95", swatchLight: "#a93528" },
  { id: "orange", value: "var(--vc-orange)", swatchDark: "#dda176", swatchLight: "#894e20" },
  { id: "amber", value: "var(--vc-amber)", swatchDark: "#c5ad5d", swatchLight: "#725a1a" },
  { id: "green", value: "var(--vc-green)", swatchDark: "#6fc162", swatchLight: "#246b19" },
  { id: "teal", value: "var(--vc-teal)", swatchDark: "#60bdb5", swatchLight: "#19695e" },
  { id: "blue", value: "var(--vc-blue)", swatchDark: "#87b1e1", swatchLight: "#265fa1" },
  { id: "violet", value: "var(--vc-violet)", swatchDark: "#c2a0e7", swatchLight: "#822fcb" },
  { id: "magenta", value: "var(--vc-magenta)", swatchDark: "#e795c3", swatchLight: "#a9287a" },
];

/** Tier 2. One ink, every ground, 3:1 or better. */
export const LITERAL_COLORS: TextColor[] = [
  { id: "red", value: "#d35248", swatchDark: "#d35248", swatchLight: "#d35248" },
  { id: "orange", value: "#b26e3c", swatchDark: "#b26e3c", swatchLight: "#b26e3c" },
  { id: "amber", value: "#977b25", swatchDark: "#977b25", swatchLight: "#977b25" },
  { id: "green", value: "#458e1f", swatchDark: "#458e1f", swatchLight: "#458e1f" },
  { id: "teal", value: "#258e73", swatchDark: "#258e73", swatchLight: "#258e73" },
  { id: "blue", value: "#1f83cb", swatchDark: "#1f83cb", swatchLight: "#1f83cb" },
  { id: "violet", value: "#9f5fde", swatchDark: "#9f5fde", swatchLight: "#9f5fde" },
  { id: "magenta", value: "#c74fa0", swatchDark: "#c74fa0", swatchLight: "#c74fa0" },
  { id: "grey", value: "#857c72", swatchDark: "#857c72", swatchLight: "#857c72" },
];

/** THE ONLY custom properties a `style` attribute may name. A `var()` is a
 *  read of the page's own cascade, so an unbounded allowlist would let a note
 *  paint itself in any value the app happens to hold — and, once
 *  `background-color` is in play, read one out by contrast. The set is the
 *  eight text-colour tokens plus the three the product already treats as ink. */
export const COLOR_TOKENS: ReadonlySet<string> = new Set([
  ...SEMANTIC_COLORS.map((c) => c.value.slice(4, -1)),
  "--text",
  "--text-muted",
  "--accent",
]);
