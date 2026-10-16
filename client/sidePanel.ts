// The side panel's stacked sections — the pure half.
//
// The panel used to be one long scroller with eleven sections poured into it,
// each with its own collapse flag in its own file, and the backlinks list had
// no header of its own to fold: with the outline and the graph open, Nearby and
// everything under it sat below a list the reader had to scroll past to find.
// Now every section is a header and a body in one stack that never scrolls as
// a whole: the bodies share the height, each scrolls inside itself, and the
// splitters between them hand height from one to the next.
//
// Everything that is arithmetic lives here so tests/sidePanel.test.ts drives
// it without a browser: the stored shape, the order, how the height is shared,
// and what a splitter drag does. The DOM half is client/components/PanelStack.tsx.

export const SECTION_IDS = [
  "outline",
  "footnotes",
  "localgraph",
  "tracker",
  "history",
  "backlinks",
  "nearby",
  "related",
  "suggest",
  "mentions",
  "onthisday",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export function isSectionId(value: unknown): value is SectionId {
  return typeof value === "string" && (SECTION_IDS as readonly string[]).includes(value);
}

/** History starts folded: it fetches the note's whole timeline, and most
 *  sessions never look at it. Everything else starts open. */
const DEFAULT_COLLAPSED: Partial<Record<SectionId, boolean>> = { history: true };

/** A splitter never squeezes an open section below this many pixels of body
 *  (or below its own content, when that is shorter): two rows of a list. */
export const BODY_MIN = 64;
/** What a minimum gives way to when the panel is too short for every open
 *  section's minimum — a window 500px tall with eight sections open. Still a
 *  row, so every section stays a place you can scroll in. */
export const BODY_FLOOR = 32;
/** The height a section that fills whatever it is given (the local graph)
 *  asks for before anyone drags. */
export const FILL_NATURAL = 200;

export interface StackPrefs {
  order: SectionId[];
  collapsed: Partial<Record<SectionId, boolean>>;
  /** Body heights in CSS px, written when a splitter is let go. A section with
   *  no entry is sized from its content. */
  sizes: Partial<Record<SectionId, number>>;
}

export function emptyPrefs(): StackPrefs {
  return { order: [...SECTION_IDS], collapsed: {}, sizes: {} };
}

/** The order a stored list asks for, made whole: unknown ids dropped,
 *  duplicates dropped, and any section the list does not name (one added in a
 *  later release) put back after the section it follows by default. */
export function orderOf(stored: readonly unknown[]): SectionId[] {
  const out: SectionId[] = [];
  for (const id of stored) if (isSectionId(id) && !out.includes(id)) out.push(id);
  SECTION_IDS.forEach((id, i) => {
    if (out.includes(id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.indexOf(SECTION_IDS[j]);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    out.splice(at, 0, id);
  });
  return out;
}

/** TOTAL: whatever is stored — nothing, a broken string, an old shape —
 *  comes back as a usable set of preferences. `legacy` answers for a section
 *  the stored value says nothing about, from the flag it kept in its own key
 *  before the sections shared one (null: no flag). */
export function parseStackPrefs(raw: string | null, legacy: (id: SectionId) => boolean | null = () => null): StackPrefs {
  let parsed: unknown = null;
  try {
    parsed = raw === null ? null : JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const obj = parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const order = orderOf(Array.isArray(obj.order) ? obj.order : []);
  const collapsed: StackPrefs["collapsed"] = {};
  const sizes: StackPrefs["sizes"] = {};
  const c = obj.collapsed !== null && typeof obj.collapsed === "object" ? (obj.collapsed as Record<string, unknown>) : null;
  const s = obj.sizes !== null && typeof obj.sizes === "object" ? (obj.sizes as Record<string, unknown>) : null;
  for (const id of SECTION_IDS) {
    const flag = c?.[id];
    if (typeof flag === "boolean") collapsed[id] = flag;
    else if (c === null) {
      const old = legacy(id);
      if (old !== null) collapsed[id] = old;
    }
    const size = s?.[id];
    if (typeof size === "number" && Number.isFinite(size) && size > 0) sizes[id] = Math.round(size);
  }
  return { order, collapsed, sizes };
}

export function serializeStackPrefs(prefs: StackPrefs): string {
  return JSON.stringify({ v: 1, order: prefs.order, collapsed: prefs.collapsed, sizes: prefs.sizes });
}

export function isCollapsed(prefs: StackPrefs, id: SectionId): boolean {
  return prefs.collapsed[id] ?? DEFAULT_COLLAPSED[id] ?? false;
}

/** `id` moved so it lands at `to` among `visible` (the sections on screen,
 *  in their current order). The hidden sections keep their places relative
 *  to their neighbours, so a section that comes back reappears where it was. */
export function moveSection(order: readonly SectionId[], visible: readonly SectionId[], id: SectionId, to: number): SectionId[] {
  const from = visible.indexOf(id);
  if (from < 0) return [...order];
  const target = Math.max(0, Math.min(visible.length - 1, to));
  if (target === from) return [...order];
  const rest = order.filter((x) => x !== id);
  const shown = visible.filter((x) => x !== id);
  // Before the visible section now at `target`, or after the last one.
  if (target < shown.length) rest.splice(rest.indexOf(shown[target]), 0, id);
  else rest.splice(rest.indexOf(shown[shown.length - 1]) + 1, 0, id);
  return rest;
}

/** One open section, as the layout sees it. */
export interface SectionBox {
  /** The body's content height, measured. */
  natural: number;
  /** Fills what it is given rather than being sized by its content. */
  fill?: boolean;
  /** The height a splitter left it at, if one did. */
  stored?: number;
}

export interface StackLayout {
  heights: number[];
  mins: number[];
  caps: number[];
  /** The minimums did not fit: the stack scrolls as a whole, the one case
   *  where it does, so no header is ever out of reach. */
  overflow: boolean;
}

function capOf(box: SectionBox): number {
  return box.fill ? Number.POSITIVE_INFINITY : Math.max(0, box.natural);
}

/** Share `avail` px of body height among the open sections.
 *
 *  Each asks for its stored height, or its content's. When the asks fit, each
 *  gets its ask: a short list is exactly as tall as itself and the space
 *  under the last section stays empty rather than being forced on anyone.
 *  When they do not, the tallest asks come down first and together — one
 *  level that every section above it is cut to — so a ten-row outline keeps
 *  its ten rows while two long lists split the rest evenly. Nothing goes
 *  below its minimum: BODY_MIN, or its content if that is shorter. */
export function layoutStack(avail: number, boxes: readonly SectionBox[]): StackLayout {
  const caps = boxes.map(capOf);
  const asks = boxes.map((b, i) => {
    const want = b.stored ?? (b.fill ? FILL_NATURAL : b.natural);
    return Math.max(0, Math.min(caps[i], want));
  });
  let mins = caps.map((c) => Math.min(BODY_MIN, c));
  const room = Math.max(0, avail);
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  let overflow = false;
  if (sum(mins) > room) {
    // Too short for every minimum: each gives way to an even share of the
    // room, never below the floor.
    const share = boxes.length > 0 ? room / boxes.length : 0;
    mins = mins.map((m) => Math.min(m, Math.max(BODY_FLOOR, share)));
    if (sum(mins) > room) overflow = true;
  }
  if (sum(asks) <= room) {
    return { heights: asks.map((a, i) => Math.round(Math.max(a, mins[i]))), mins, caps, overflow };
  }
  if (overflow) return { heights: mins.map(Math.round), mins, caps, overflow };
  // The level L such that Σ max(min, min(ask, L)) = room; the sum is
  // monotonic in L, so bisect.
  const at = (level: number) => sum(asks.map((a, i) => Math.max(mins[i], Math.min(a, level))));
  let lo = 0;
  let hi = Math.max(...asks, 0);
  for (let n = 0; n < 40; n++) {
    const mid = (lo + hi) / 2;
    if (at(mid) > room) hi = mid;
    else lo = mid;
  }
  return { heights: whole(asks.map((a, i) => Math.max(mins[i], Math.min(a, lo))), room), mins, caps, overflow };
}

/** Whole pixels that still add up: floor each, then hand the pixels the
 *  flooring lost to the largest remainders (never past `room`). */
function whole(xs: readonly number[], room: number): number[] {
  const out = xs.map(Math.floor);
  let spare = Math.min(Math.round(xs.reduce((a, b) => a + b, 0)), Math.floor(room)) - out.reduce((a, b) => a + b, 0);
  const byRemainder = xs.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of byRemainder) {
    if (spare <= 0) break;
    out[i] += 1;
    spare--;
  }
  return out;
}

/** A splitter moved by `delta` px (down is positive). The splitter sits above
 *  open section `index` (so between `index - 1` and `index`).
 *
 *  The side the splitter moves into SHRINKS, nearest section first and then
 *  the next one along once the nearest is at its minimum — so a long drag
 *  keeps going instead of stopping dead at the first small section. The other
 *  side GROWS the same way, each section up to its cap (its content; the
 *  graph has none). The splitter moves only as far as both sides can follow,
 *  and the total never changes. */
export function dragSplit(
  heights: readonly number[],
  mins: readonly number[],
  caps: readonly number[],
  index: number,
  delta: number,
): number[] {
  const out = [...heights];
  if (index <= 0 || index >= heights.length || delta === 0) return out;
  const down = delta > 0;
  // Grow toward the splitter's far side from the section next to it.
  const growers = down ? range(index - 1, -1) : range(index, heights.length);
  const shrinkers = down ? range(index, heights.length) : range(index - 1, -1);
  const canShrink = shrinkers.reduce((a, i) => a + Math.max(0, out[i] - mins[i]), 0);
  const canGrow = growers.reduce((a, i) => a + Math.max(0, caps[i] - out[i]), 0);
  const move = Math.min(Math.abs(delta), canShrink, canGrow);
  let left = move;
  for (const i of shrinkers) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, out[i] - mins[i]));
    out[i] -= take;
    left -= take;
  }
  left = move;
  for (const i of growers) {
    if (left <= 0) break;
    const give = Math.min(left, Math.max(0, caps[i] - out[i]));
    out[i] += give;
    left -= give;
  }
  return out.map((h) => Math.round(h));
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  if (from <= to) for (let i = from; i < to; i++) out.push(i);
  else for (let i = from; i > to; i--) out.push(i);
  return out;
}

/** The splitter's place as ARIA wants it: how much of the two sections it
 *  divides lies above it, in percent. */
export function splitValue(above: number, below: number): number {
  const total = above + below;
  return total > 0 ? Math.round((above / total) * 100) : 50;
}
