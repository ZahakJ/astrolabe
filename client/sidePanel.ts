// The side panel's stacked sections — the pure half.
//
// Every section of the panel (outline, footnotes, graph, history, backlinks,
// Nearby and the rest) is a header that folds it and a body at its own
// height; the panel scrolls as a whole when the open ones are taller than the
// window. What is kept is which sections are folded and the order the reader
// dragged them into.
//
// Everything that is not DOM lives here so tests/sidePanel.test.ts drives it
// without a browser: the stored shape and the order. The DOM half is
// client/components/PanelStack.tsx.

export const SECTION_IDS = [
  "outline",
  "footnotes",
  "localgraph",
  "tracker",
  "sources",
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

export interface StackPrefs {
  order: SectionId[];
  collapsed: Partial<Record<SectionId, boolean>>;
}

export function emptyPrefs(): StackPrefs {
  return { order: [...SECTION_IDS], collapsed: {} };
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
 *  before the sections shared one (null: no flag). The body heights 3.45.0
 *  stored beside them are not read, and go with the next write. */
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
  const c = obj.collapsed !== null && typeof obj.collapsed === "object" ? (obj.collapsed as Record<string, unknown>) : null;
  for (const id of SECTION_IDS) {
    const flag = c?.[id];
    if (typeof flag === "boolean") collapsed[id] = flag;
    else if (c === null) {
      const old = legacy(id);
      if (old !== null) collapsed[id] = old;
    }
  }
  return { order, collapsed };
}

export function serializeStackPrefs(prefs: StackPrefs): string {
  return JSON.stringify({ v: 1, order: prefs.order, collapsed: prefs.collapsed });
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
