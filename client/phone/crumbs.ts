// A FOLDER'S PATH AS CRUMBS — which of them fit in the top bar.
//
// A folder screen's bar reads "Notes › Mathematics › تاريخ الرياضيات", each
// crumb a way up (./up.ts). A phone's bar has room for perhaps two of them,
// a Fold's cover screen for one and a half, so the middle folds into "…",
// which opens a sheet of the folders it hides. The rules, in the order they
// give way:
//
//   1. Everything, when it fits.
//   2. The root, "…", and as many of the nearest folders as fit — the parent
//      is the likeliest way up, the root the likeliest way out.
//   3. "…" and the current folder alone.
//
// The current folder is never folded: it is the screen's title. When even it
// does not fit, the bar truncates it at its end, and the whole name is the
// document's title and the row the reader just tapped.
//
// Pure (widths in, a plan out), so tests/phoneCrumbs.test.ts holds the rules
// without a page; client/phone/Crumbs.tsx measures and draws.

export interface Crumb {
  /** The folder's path; "" for the root. */
  path: string;
  label: string;
}

/** The crumbs of folder `path`, the root first and `path` last. */
export function crumbsOf(path: string, rootLabel: string): Crumb[] {
  const out: Crumb[] = [{ path: "", label: rootLabel }];
  if (path === "") return out;
  const parts = path.split("/");
  for (let i = 0; i < parts.length; i += 1) out.push({ path: parts.slice(0, i + 1).join("/"), label: parts[i] });
  return out;
}

/** What to draw: crumb indexes in order, with `"more"` where the fold is. */
export type CrumbPlan = { items: (number | "more")[]; hidden: number[] };

/**
 * Plan `widths.length` crumbs into `room` px.
 *
 * @param widths each crumb's drawn width, the last one the current folder's
 * @param sep    a separator's width (drawn between every two items)
 * @param more   the "…" button's width
 */
export function collapseCrumbs(widths: number[], room: number, sep: number, more: number): CrumbPlan {
  const n = widths.length;
  const all = Array.from({ length: n }, (_, i) => i);
  if (n <= 1) return { items: all, hidden: [] };
  const sum = (idx: number[]): number => idx.reduce((a, i) => a + widths[i], 0);
  if (sum(all) + sep * (n - 1) <= room) return { items: all, hidden: [] };
  // 2. the root, "…", and the nearest `k` folders (the current one included).
  for (let k = n - 2; k >= 1; k -= 1) {
    const tail = all.slice(n - k);
    const w = widths[0] + sep + more + sep + sum(tail) + sep * (k - 1);
    if (w <= room) return { items: [0, "more", ...tail], hidden: all.slice(1, n - k) };
  }
  // 3. "…" and the current folder.
  return { items: ["more", n - 1], hidden: all.slice(0, n - 1) };
}
