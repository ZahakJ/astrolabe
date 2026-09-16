// `![[Book.pdf#page=42]]` — ONE PAGE OF A BOOK, IN THE NOTE.
//
// A citation (`[[Book.pdf#page=42]]`) is a door; this is the page itself,
// drawn as a picture where the embed stands, with "Book, p. 42" under it
// that opens the reader on that page. It is the covers module's promise made
// to the body of the book: the reader already knows how to paint a page, so
// the note asks it to, lazily (client/books/pageImage.ts imports pdf.js and
// arrives only when a note actually carries a page embed).
//
// One builder for three surfaces. The editor's widget (client/editor/
// widgets.ts) calls this and asks CodeMirror to re-measure when the picture
// lands; the reading view and the site call it and need nothing more. On the
// site the visitor sees the same picture when the book is published — the
// resolver and /api/file are already scoped to them — and a plain ⌀ when it
// is not, exactly as a private image reads to them.

import { pdfDisplayName } from "../../shared/mediaEmbeds.ts";
import { localeNum, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import { brokenEmbed, embedKnownBroken, fileUrl, markEmbedBroken, resolveAttachment } from "../editor/embeds.ts";

export interface PdfPageHooks {
  /** The picture arrived, or the card became a placeholder: the height
   *  changed after the caller measured it. */
  onResize?: () => void;
}

/** The page's box before its picture: a paper-shaped slot at the width the
 *  picture will take, so the column does not jump when it lands — the
 *  tracker's rule (`s-rv-tracker-pending`). A4 is the guess; a landscape
 *  page corrects it on arrival. */
const PLACEHOLDER_RATIO = 1.414;

export function pdfPageEmbed(target: string, page: number, width: number | null, hooks: PdfPageHooks = {}): HTMLElement {
  const fig = document.createElement("figure");
  fig.className = "s-rv-figure s-rv-pdfpage";
  const slot = document.createElement("span");
  slot.className = "s-rv-pdfpage__slot s-rv-pdfpage__slot--pending";
  if (width) slot.style.width = `${width}px`;
  slot.style.aspectRatio = `1 / ${PLACEHOLDER_RATIO}`;
  fig.appendChild(slot);
  const caption = document.createElement("figcaption");
  caption.className = "s-rv-pdfpage__caption";
  const open = document.createElement("a");
  open.className = "s-rv-pdfpage__open";
  open.dir = "auto";
  open.textContent = tf("pdfPageCaption", { book: pdfDisplayName(target), page: localeNum(page) });
  open.title = tf("pdfPageOpen", { page: localeNum(page) });
  // A real href — the file at its page, which every browser's own PDF viewer
  // understands — so the caption is a link to the keyboard and to paper, and
  // so a visitor with no reader still lands on the page. The owner's click is
  // answered by the reader instead (below).
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  caption.appendChild(open);
  fig.appendChild(caption);

  const fail = (): void => {
    // The picture could not be had: the placeholder every missing embed
    // gets, and the caption goes with it — a "p. 42" pointing at nothing is
    // a promise the card cannot keep.
    fig.replaceWith(brokenEmbed(`${target}#page=${page}`));
    hooks.onResize?.();
  };
  const draw = (path: string): void => {
    open.href = `${fileUrl(path)}#page=${page}`;
    open.addEventListener("click", (ev) => {
      if (!useStore.getState().admin) return; // the href does the visitor's work
      ev.preventDefault();
      ev.stopPropagation();
      void import("../books/door.ts").then((mod) => mod.openBookPage(path, page));
    });
    // The width the picture will be shown at: the embed's own, or the
    // column's. Measured once the slot is in the tree; a detached card (the
    // editor builds widgets before attaching them) waits a frame.
    let waited = 0;
    const paint = (): void => {
      const cssWidth = width ?? Math.round(slot.getBoundingClientRect().width);
      if (cssWidth < 32) {
        // Not laid out yet (or never: a widget CodeMirror built and dropped).
        // A second of frames is patience enough; after that the card is not
        // on any screen and there is nothing to paint for.
        if (++waited < 60) requestAnimationFrame(paint);
        return;
      }
      void import("../books/pageImage.ts")
        .then((mod) => mod.renderPageImage(path, page, cssWidth))
        .then((picture) => {
          const img = document.createElement("img");
          img.className = "s-rv-img s-rv-pdfpage__img";
          img.alt = tf("pdfPageAlt", { book: pdfDisplayName(target), page: localeNum(page) });
          img.width = picture.cssWidth;
          img.height = picture.cssHeight;
          img.src = picture.src;
          slot.style.aspectRatio = "";
          slot.classList.remove("s-rv-pdfpage__slot--pending");
          slot.replaceChildren(img);
          hooks.onResize?.();
        })
        .catch(() => {
          markEmbedBroken(`${target}#page=${page}`);
          fail();
        });
    };
    if (fig.isConnected) paint();
    else requestAnimationFrame(paint);
  };
  if (embedKnownBroken(`${target}#page=${page}`)) {
    queueMicrotask(fail);
    return fig;
  }
  const r = resolveAttachment(target);
  const apply = (path: string | null): void => {
    if (path === null) queueMicrotask(fail);
    else draw(path);
  };
  if (r instanceof Promise) void r.then(apply);
  else apply(r);
  return fig;
}
