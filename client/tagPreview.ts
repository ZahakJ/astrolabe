// A TAG PILL, HOVERED: the three notes that carry it most, in a card beside
// the pill. The sidebar's tag shelf is a list of counts — "#reading · 41" —
// and a count is a promise of notes it does not show; clicking narrows the
// whole tree to find out, which is a commitment for a glance. The card
// answers the glance: rest on the pill and the top three hits for that tag
// float beside it, title, folder, and a line of the match, the way a note
// row's card floats its opening (client/landing.ts).
//
// The engine is client/hovercard.ts, UNCHANGED — the same LRU, the same
// timers, the same keyboard route (a pill reached by arrow keys and focused
// opens the same card). What differs is only what the three callbacks say:
// `resolve` reads the pill's `data-tag`, `title` prints the pill's label,
// and `render` asks the search index — `#tag` is exactly the query the pill's
// click runs — for its first three answers, so the card and the click can
// never disagree about which notes come first.
//
// Reached by dynamic import from Sidebar.tsx, like the note previews: the
// hover engine is interaction-time code and stays out of first paint.

import { search } from "./api.ts";
import { snippetIsEmpty, snippetText } from "./components/snippet.tsx";
import { installHoverCards } from "./hovercard.ts";
import { countPhrase } from "./i18n.ts";
import { label as tagLabel } from "./tagLabels.ts";
import { noteTitleOf } from "../shared/noteFormat.ts";
import "./styles/tagpreview.css";

/** How many notes a card shows. Three: enough to say what the tag is
 *  about, few enough to read in the time a pointer rests. */
const TOP = 3;

function folderOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

/** Install tag previews over `root` (the shelf's list). `countOf` is the
 *  shelf's own count for a tag — the search answer is capped at fifty, and
 *  the pill already knows the true number. Returns the disposer; the
 *  sidebar re-installs on a language flip because the card's count line
 *  carries t() words. */
export function installTagPreviews(
  root: HTMLElement,
  scroller: HTMLElement | null,
  countOf: (tag: string) => number | null,
): () => void {
  return installHoverCards({
    root,
    scroller,
    // The card's key is the canonical tag with its hash, which is also the
    // search it runs — one string, three jobs.
    resolve: (el) => {
      const pill = el.closest<HTMLElement>(".s-tag[data-tag]");
      const tag = pill?.dataset.tag;
      return tag ? `#${tag}` : null;
    },
    title: (key) => `#${tagLabel(key.slice(1))}`,
    render: async (key) => {
      let hits;
      try {
        hits = await search(key);
      } catch {
        return null; // the index is away: no card, no trace
      }
      // Notes only — a PDF page on the shelf is a search hit too, and a
      // book is not "a note carrying the tag".
      const top = hits.filter((hit) => hit.kind !== "book").slice(0, TOP);
      if (top.length === 0) return null;
      const list = document.createElement("ol");
      list.className = "s-hovercard__tagnotes";
      for (const hit of top) {
        const row = document.createElement("li");
        row.className = "s-hovercard__tagnote";
        const title = document.createElement("span");
        title.className = "s-hovercard__tagnote-title";
        title.dir = "auto";
        title.textContent = hit.title || noteTitleOf(hit.path);
        row.appendChild(title);
        const folder = folderOf(hit.path);
        if (folder !== "") {
          const where = document.createElement("span");
          where.className = "s-hovercard__tagnote-path";
          where.dir = "auto";
          where.textContent = folder;
          row.appendChild(where);
        }
        if (!snippetIsEmpty(hit.snippet)) {
          const line = document.createElement("span");
          line.className = "s-hovercard__tagnote-snippet";
          line.dir = "auto";
          line.textContent = snippetText(hit.snippet);
          row.appendChild(line);
        }
        list.appendChild(row);
      }
      const wrap = document.createElement("div");
      wrap.appendChild(list);
      // "41 notes": the pill's count, restated under the three, so the card
      // never reads as the whole answer when it is the top of one.
      const total = countOf(key.slice(1));
      if (total !== null && total > top.length) {
        const more = document.createElement("p");
        more.className = "s-hovercard__tagnote-more";
        more.textContent = countPhrase(total, "notes");
        wrap.appendChild(more);
      }
      return wrap;
    },
  });
}
