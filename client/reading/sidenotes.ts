// SIDENOTES — the footnotes set in the margin, beside the line that cites
// them, when the reading column has a margin to set them in.
//
// The renderer keeps building the footnote section at the foot of the note
// (render.ts); it is what a narrow window, the site, the editor's cards and
// PAPER all show, and it is what the reader's print gate asserts is last.
// This module adds a second copy of each definition, positioned in the
// margin next to its first reference, and hides the foot while that copy is
// on screen. Nothing is moved and nothing is re-rendered: the foot stays in
// the DOM, so a hop to `#fn-3` still has somewhere to go, and print.css
// puts the foot back and the margin away.
//
// THE RULES. Only the READING VIEW installs this (ReadingView.tsx), because
// the site's column and the editor's are different columns with different
// margins. It turns on at a column of 1180px or wider — the reading pane's
// own width, not the window's, so a split workspace gets the foot and a
// full-width one gets the margin — and only when that width leaves a real
// margin (a "full" writing column has none). Two notes that would overlap
// stack downward, never up, never over each other (shared/footnotes.ts
// stackSidenotes, tested). The side is the OUTER margin of the citing line:
// an English paragraph's is the right, an Arabic paragraph's the left, and
// a bilingual note gets both, each note beside its own line. Nothing here
// runs for a note without footnotes.

import { stackSidenotes } from "../../shared/footnotes.ts";
import "./sidenotes.css";

/** The narrowest reading column that sets its notes in the margin. */
export const SIDENOTE_MIN_COLUMN = 1180;
/** The narrowest margin worth putting a note in, and the note's widest. */
const MIN_MARGIN = 180;
const MAX_WIDTH = 220;
/** Between the column's edge and the note, and between stacked notes. */
const GAP = 28;
const STACK_GAP = 12;

/** Install on a rendered reading column; returns the uninstaller. */
export function installSidenotes(host: HTMLElement, content: HTMLElement): () => void {
  const foot = content.querySelector<HTMLElement>(":scope > .s-rv-footnotes");
  if (foot === null) return () => {};
  const items = [...foot.querySelectorAll<HTMLElement>(":scope > ol > li[id]")];
  if (items.length === 0) return () => {};

  const layer = document.createElement("div");
  layer.className = "s-rv-sidenotes";
  layer.hidden = true;
  const notes: { el: HTMLElement; label: string }[] = [];
  for (const li of items) {
    const label = li.id.replace(/^fn-/, "");
    const aside = document.createElement("aside");
    aside.className = "s-rv-sidenote";
    aside.id = `sn-${label}`;
    aside.dir = "auto";
    const num = document.createElement("a");
    num.className = "s-rv-sidenote__num";
    num.href = `#fnref-${encodeURIComponent(label)}`;
    num.dataset.fnback = label;
    num.setAttribute("role", "link");
    num.tabIndex = 0;
    num.textContent = label;
    const back = li.querySelector<HTMLElement>(".s-rv-fnback");
    if (back) {
      num.title = back.title;
      num.setAttribute("aria-label", back.getAttribute("aria-label") ?? back.title);
    }
    const text = document.createElement("span");
    text.className = "s-rv-sidenote__text";
    for (const node of li.childNodes) {
      if (node instanceof HTMLElement && node.classList.contains("s-rv-fnback")) continue;
      text.appendChild(node.cloneNode(true));
    }
    aside.append(num, text);
    layer.appendChild(aside);
    notes.push({ el: aside, label });
  }
  // Before the foot, never after it: the foot is the document's last block
  // (scripts/check-print.mjs asserts so on the printed clone).
  content.insertBefore(layer, foot);

  let raf = 0;
  const layout = (): void => {
    raf = 0;
    if (!content.isConnected) return;
    const contentRect = content.getBoundingClientRect();
    const hostWidth = host.clientWidth;
    const margin = (hostWidth - contentRect.width) / 2;
    const on = hostWidth >= SIDENOTE_MIN_COLUMN && margin >= MIN_MARGIN;
    content.classList.toggle("s-rv--sidenotes", on);
    layer.hidden = !on;
    if (!on) return;
    const width = Math.min(MAX_WIDTH, Math.floor(margin - GAP - 12));
    layer.style.setProperty("--sidenote-width", `${width}px`);
    layer.style.setProperty("--sidenote-gap", `${GAP}px`);
    const wants: { want: number; height: number }[] = [];
    for (const note of notes) {
      const ref = content.querySelector<HTMLElement>(`#fnref-${CSS.escape(note.label)}`);
      const rect = ref?.getBoundingClientRect() ?? null;
      // The side: the outer margin of the LINE that cites it. Physical on
      // purpose — it is chosen from the text's direction, not the chrome's.
      const block = ref?.closest<HTMLElement>("p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, div") ?? content;
      const rtl = getComputedStyle(block).direction === "rtl";
      note.el.classList.toggle("s-rv-sidenote--left", rtl);
      note.el.classList.toggle("s-rv-sidenote--right", !rtl);
      // A reference inside a folded callout has no box; the note then sits
      // under the one above it, which the stacking already arranges.
      const want = rect !== null && rect.height > 0 ? rect.top - contentRect.top - 2 : -Infinity;
      wants.push({ want, height: note.el.offsetHeight });
    }
    const tops = stackSidenotes(wants.map((w) => ({ want: Math.max(0, w.want), height: w.height })), STACK_GAP);
    notes.forEach((note, i) => {
      note.el.style.top = `${Math.round(tops[i])}px`;
    });
  };
  const schedule = (): void => {
    if (raf === 0) raf = requestAnimationFrame(layout);
  };
  // The column's width decides whether; the content's height (a picture
  // landing, math hydrating, a card arriving) decides where.
  const ro = new ResizeObserver(schedule);
  ro.observe(host);
  ro.observe(content);
  schedule();
  return () => {
    ro.disconnect();
    if (raf !== 0) cancelAnimationFrame(raf);
    layer.remove();
    content.classList.remove("s-rv--sidenotes");
  };
}
