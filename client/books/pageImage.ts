// ONE PAGE OF A BOOK AS A PICTURE — what `![[Book.pdf#page=42]]` draws.
//
// The reader (client/books/render.ts) paints pages onto a canvas the reader
// owns, with a text layer and a night mode; an embed in a note wants none of
// that. It wants a picture at the column's width, once, that the note can
// keep. So this is the covers module's shape (client/books/covers.ts) turned
// toward the body of the book: open the document, render one page at the
// asked width, keep the JPEG, and let the DOCUMENT go — with one difference,
// which is that a note citing five pages of one book would otherwise open
// the same 400 MB file five times, so a document stays open for a few
// seconds after its last page in case the next embed is the same book.
//
// This module is reached ONLY through `import()` from client/reading/
// pdfPage.ts: it imports pdf.js, and scripts/check-bundle.mjs forbids that
// from every first paint.

import { Lru } from "../lru.ts";
import { clampCanvasScale } from "./layout.ts";
import { closeDocument, openDocument, type PdfDocument } from "./pdfjs.ts";

/** Pictures already drawn, by path, page and width — a note re-rendered on
 *  every save must not re-decode its pages. ~60 kB each at column width;
 *  64 of them is the working set of a long note, not a library. */
const pictures = new Lru<string>({ max: 64 });

/** Open documents, kept a moment after their last use. */
const open = new Map<string, { doc: Promise<PdfDocument>; timer: ReturnType<typeof setTimeout> | null }>();
const HOLD_MS = 8000;

/** Pictures are rendered at up to 2× for a retina display, like covers: a
 *  page of type in a note is read, so it gets the sharper of the two. */
const MAX_DPR = 2;

function documentFor(path: string): Promise<PdfDocument> {
  let entry = open.get(path);
  if (!entry) {
    entry = { doc: openDocument(path), timer: null };
    open.set(path, entry);
    // A document that will not open is not kept: the next embed asks again.
    entry.doc.catch(() => open.delete(path));
  }
  if (entry.timer !== null) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    open.delete(path);
    void entry!.doc.then((doc) => closeDocument(doc)).catch(() => {});
  }, HOLD_MS);
  return entry.doc;
}

export interface PageImage {
  /** A JPEG data URL — data, not a blob URL, for the reason covers.ts gives. */
  src: string;
  /** CSS pixels: the width asked for, and the height that width implies. */
  cssWidth: number;
  cssHeight: number;
}

/** Page `page` of the PDF at `path`, drawn `cssWidth` wide. Rejects when the
 *  document cannot be opened or the page does not exist. */
export async function renderPageImage(path: string, page: number, cssWidth: number): Promise<PageImage> {
  const width = Math.max(64, Math.round(cssWidth));
  const key = `${path}#${page}@${width}`;
  const cached = pictures.get(key);
  const doc = await documentFor(path);
  if (page < 1 || page > doc.numPages) throw new Error(`astrolabe: no page ${page}`);
  const pdfPage = await doc.getPage(page);
  const base = pdfPage.getViewport({ scale: 1 });
  const cssHeight = Math.round((width * base.height) / (base.width || 1));
  if (cached !== undefined) return { src: cached, cssWidth: width, cssHeight };
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_DPR));
  const scale = clampCanvasScale((width * dpr) / (base.width || 1), base.width, base.height);
  const viewport = pdfPage.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("astrolabe: no 2d context for a page picture");
  // The paper's own white under a transparent page, as covers.ts explains.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;
  const src = canvas.toDataURL("image/jpeg", 0.85);
  pictures.set(key, src);
  return { src, cssWidth: width, cssHeight };
}
