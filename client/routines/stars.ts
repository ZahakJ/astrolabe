// THE ORBIT ↔ CONSTELLATION LINK. An orbit slot that names a constellation
// note with a wikilink ("review: [[Constellations/Japanese/Hiragana]] — every
// star due, 10 min") is the day's study in the plan, and the constellation is
// where the studying happens, so the two are wired both ways:
//
//   - the orbit card shows, after that slot's text, a chip per linked
//     constellation: how many stars are due and a Study link into the session
//     (`decorateStarTasks`, called by the Orbits page once the card is drawn);
//   - a session that ends with nothing due ticks the slot for today through
//     the tick route the checkbox already uses (`tickSlotForConstellation`,
//     the one export the session-end handler calls).
//
// Nothing here is a new kind of state: the link is the note's own wikilink,
// the tick is the log line the checkbox writes, the due count is the shelf's.
// The module stays small on purpose — the Orbits files belong to another
// session and this is the whole of the touch.

import type { ConstellationMeta } from "../../shared/constellations.ts";
import { isoDate, tasksFor, type RoutineTask } from "../../shared/routine.ts";
import { stripNoteExt } from "../../shared/noteFormat.ts";
import type { RoutineMeta, TreeNode } from "../../shared/types.ts";
import { getRoutines, updateRoutine, withPreview } from "../api.ts";
import { parseWikilink, resolveLink, WIKILINK_RE } from "../editor/links.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { notePathToUrl } from "../router.ts";
import { useStore } from "../state.ts";

/** One wikilink in a task's text, resolved to a vault path when the tree
 *  knows the note. `label` is what the card shows in place of the brackets:
 *  the alias if one was written, else the last segment of the target. */
interface TaskLink {
  raw: string;
  path: string | null;
  label: string;
}

function samePath(a: string, b: string): boolean {
  return stripNoteExt(a).toLowerCase() === stripNoteExt(b).toLowerCase();
}

/** The wikilinks in a task (its text, or its key for a bare every-day item). */
function linksOf(task: RoutineTask, tree: TreeNode | null): TaskLink[] {
  const text = task.text ?? task.key;
  const out: TaskLink[] = [];
  for (const m of text.matchAll(WIKILINK_RE)) {
    const parts = parseWikilink(m[1]);
    // Without a tree (the page opened before the vault arrived) the target's
    // own spelling still names the note, so a `Constellations/…/Hiragana`
    // link ticks and links correctly even then.
    const path = resolveLink(parts.target, tree) ?? (parts.target.includes("/") ? `${stripNoteExt(parts.target)}.md` : null);
    const label = parts.alias ?? stripNoteExt(parts.target).split("/").pop() ?? parts.target;
    out.push({ raw: m[0], path, label });
  }
  return out;
}

/** Every task of `meta` for `date` that links `path`. */
function tasksLinking(meta: RoutineMeta, date: string, path: string, tree: TreeNode | null): { task: RoutineTask; links: TaskLink[] }[] {
  const out: { task: RoutineTask; links: TaskLink[] }[] = [];
  for (const task of tasksFor(meta.plan, date)) {
    const links = linksOf(task, tree);
    if (links.some((l) => l.path !== null && samePath(l.path, path))) out.push({ task, links });
  }
  return out;
}

// The shelf's counts, fetched at most every few seconds: every card on the
// Orbits page asks for them when it is drawn, and a page of six orbits is one
// request, not six. A vault event redraws the cards and the cache has lapsed
// by then, so a session's grades show up as they land.
let shelf: { at: number; p: Promise<ConstellationMeta[]> } | null = null;
function constellations(fresh = false): Promise<ConstellationMeta[]> {
  const now = Date.now();
  if (!fresh && shelf && now - shelf.at < 3000) return shelf.p;
  const p = fetch("/api/constellations", withPreview({ credentials: "same-origin" }))
    .then((res) => (res.ok ? (res.json() as Promise<ConstellationMeta[]>) : []))
    .catch(() => [] as ConstellationMeta[]);
  shelf = { at: now, p };
  return p;
}

function sameKey(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Tick, for today, every orbit slot whose text wikilinks the constellation
 *  at `path` — the session for it just ended with nothing due. A slot that
 *  links several constellations is ticked only when none of them has a star
 *  due, because "review" was the whole slot, not one deck of it. Resolves to
 *  the number of slots ticked; a failure to read or write is a quiet zero,
 *  the session's own summary is the thing the reader is looking at. */
export async function tickSlotForConstellation(path: string): Promise<number> {
  const today = isoDate(new Date());
  const tree = useStore.getState().tree;
  let routines: RoutineMeta[];
  try {
    routines = await getRoutines();
  } catch {
    return 0;
  }
  let dueOf: ((p: string) => number) | null = null;
  let ticked = 0;
  for (const meta of routines) {
    if (meta.template) continue;
    const entry = meta.entries.find((e) => e.date === today) ?? null;
    let done = entry?.done ?? [];
    let changed = false;
    for (const { task, links } of tasksLinking(meta, today, path, tree)) {
      if (done.some((d) => sameKey(d, task.key))) continue;
      const others = links.filter((l) => l.path !== null && !samePath(l.path, path)).map((l) => l.path as string);
      if (others.length > 0) {
        if (dueOf === null) {
          // Fresh, not the card's cache: the grades that just landed are
          // the counts this decision is about.
          const list = await constellations(true);
          dueOf = (p) => list.find((c) => samePath(c.path, p))?.counts.due ?? 0;
        }
        if (others.some((p) => (dueOf as (p: string) => number)(p) > 0)) continue;
      }
      done = [...done, task.key];
      changed = true;
      ticked++;
    }
    if (!changed) continue;
    try {
      await updateRoutine(meta.path, meta.index, { date: today, done });
    } catch {
      ticked = 0;
    }
  }
  return ticked;
}

/** Dress a drawn orbit card: for each of today's tasks that links a
 *  constellation, show the link by its name instead of its brackets and add
 *  a chip per constellation, "N due · Study", opening the session. The card
 *  is the reading renderer's, rebuilt whole on every change, so this runs
 *  after each draw and holds nothing between draws. */
export function decorateStarTasks(card: HTMLElement, meta: RoutineMeta, today: string): void {
  const tree = useStore.getState().tree;
  const tasks = tasksFor(meta.plan, today);
  const rows = card.querySelectorAll<HTMLElement>(".s-rv-routine__task");
  const wanted: { row: HTMLElement; links: TaskLink[] }[] = [];
  // The renderer draws tasksFor(plan, today) in order, one <li> each, so the
  // nth row is the nth task.
  tasks.forEach((task, i) => {
    const row = rows[i];
    if (!row) return;
    const links = linksOf(task, tree).filter((l) => l.path !== null);
    if (links.length === 0) return;
    for (const span of row.querySelectorAll<HTMLElement>(".s-rv-routine__taskkey, .s-rv-routine__tasktext")) {
      let text = span.textContent ?? "";
      for (const l of links) text = text.split(l.raw).join(l.label);
      span.textContent = text;
    }
    wanted.push({ row, links });
  });
  if (wanted.length === 0) return;
  void constellations().then((list) => {
    if (!card.isConnected) return;
    for (const { row, links } of wanted) {
      const chips = document.createElement("span");
      chips.className = "s-stars-chips";
      const seen = new Set<string>();
      for (const l of links) {
        const path = l.path as string;
        const key = stripNoteExt(path).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const c = list.find((m) => samePath(m.path, path));
        // A note the shelf does not list is not a constellation (or the
        // shelf is unreachable): no chip, the name alone is the link's due.
        if (!c) continue;
        const a = document.createElement("a");
        a.className = `s-stars-chip${c.counts.due === 0 ? " is-clear" : ""}`;
        a.href = `/constellations${notePathToUrl(path)}`;
        a.title = c.title;
        a.setAttribute("aria-label", tf("starsOrbitStudyTitle", { title: c.title }));
        // A slot that names four constellations gets four chips in a row;
        // the icon says which is which (the title is on hover and for the
        // screen reader).
        if (c.icon) {
          const icon = document.createElement("span");
          icon.className = "s-stars-chip__icon";
          icon.textContent = c.icon;
          icon.setAttribute("aria-hidden", "true");
          a.appendChild(icon);
        }
        const n = document.createElement("span");
        n.className = "s-stars-chip__n";
        n.textContent = tf("starsOrbitDue", { n: localeNum(c.counts.due) });
        a.appendChild(n);
        a.appendChild(document.createTextNode(` · ${t("starsOrbitStudy")}`));
        a.addEventListener("click", (ev) => {
          if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return; // a new tab is the browser's
          ev.preventDefault();
          // The session is a route: push it and let the router open it, the
          // way the address bar would.
          history.pushState(null, "", a.getAttribute("href"));
          window.dispatchEvent(new PopStateEvent("popstate"));
        });
        chips.appendChild(a);
      }
      if (chips.childElementCount > 0) row.appendChild(chips);
    }
  });
}
