// UP, BY PATH — what a folder's chevron and its breadcrumbs ask of the stack.
//
// The browser's back is "where I was"; a folder's ‹ is "the folder this one
// is in". They are the same thing only when the reader drilled down from the
// root one folder at a time, and a reader on a Galaxy Z Fold found the case
// where they are not: the chevron beside "تاريخ الرياضيات" opened Today,
// because Today was the entry under it (nav.ts, "BACK MEANS UP"). So the
// chevron and the crumbs name a TARGET STACK here — the stack the tab should
// hold with the parent on top — and `nav.upTo` makes history agree with it.
//
// The target keeps whatever the reader came by, up to the deepest screen
// that is on the way (the root, or a folder above the one asked for), and
// adds the folders between that screen and the one asked for. Pure: the
// crumbs' test and the stack's test hold it without a page.

import { rootOf, type Screen, type TabId } from "./nav.ts";

/** The folder `path` is in: "" for the vault's root. */
export function parentPath(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Every folder from the top of the vault down to `path`, `path` last:
 *  "a/b/c" → ["a", "a/b", "a/b/c"]; "" → []. */
export function foldersDownTo(path: string): string[] {
  if (path === "") return [];
  const parts = path.split("/");
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 1) out.push(parts.slice(0, i + 1).join("/"));
  return out;
}

/** Is folder `a` the folder `b` or above it? ("" is above everything.) */
function above(a: string, b: string): boolean {
  return a === "" || a === b || b.startsWith(`${a}/`);
}

/** The stack `tab` should hold to show folder `path` ("" = the tab's root),
 *  reached by going up from the top of `stack`. */
export function chainTo(stack: Screen[], tab: TabId, path: string): Screen[] {
  // The deepest screen below the top that is on the way to `path`.
  let i = stack.length - 2;
  let at = "";
  for (; i >= 0; i -= 1) {
    const s = stack[i];
    if (s.kind === "root") {
      at = "";
      break;
    }
    if (s.kind === "folder" && above(s.path, path)) {
      at = s.path;
      break;
    }
  }
  const kept = i >= 0 ? stack.slice(0, i + 1) : [rootOf(tab)];
  const from = at === "" ? 0 : foldersDownTo(at).length;
  const more = foldersDownTo(path)
    .slice(from)
    .map((p): Screen => ({ kind: "folder", path: p }));
  return [...kept, ...more];
}

/** Where a folder screen's ‹ goes: its parent, by path. Null for a stack
 *  whose top is not a folder (every other screen's ‹ is the browser's back). */
export function upChain(stack: Screen[], tab: TabId): Screen[] | null {
  const top = stack[stack.length - 1];
  if (!top || top.kind !== "folder") return null;
  return chainTo(stack, tab, parentPath(top.path));
}
