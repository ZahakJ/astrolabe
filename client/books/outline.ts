// THE BOOK'S OWN CONTENTS, flattened. pdf.js hands back a tree of outline
// items whose destinations come in two shapes — an explicit array whose
// first element is a page reference, or a NAME that has to be looked up
// first — and both are common in the wild; a reader that handles only the
// first has no contents page for half the books in a vault. One walk, one
// answer: every entry with its depth and its 1-based page (0 when the
// destination could not be resolved). The reader's `o` panel and the
// "Highlights → note" action read the same list.

import type { OutlineEntry } from "../../shared/highlightsNote.ts";
import type { PdfDocument } from "./pdfjs.ts";

/** What `doc.getOutline()` hands back. Named rather than written inline at
 *  the use site: a nested generic inside a .tsx line reads to check-i18n's
 *  bare-English scan as `>…text…<`, i.e. as untranslated copy in JSX. */
type OutlineItems = Awaited<ReturnType<PdfDocument["getOutline"]>>;

export async function readOutline(doc: PdfDocument): Promise<OutlineEntry[]> {
  const rows: OutlineEntry[] = [];
  const raw = await doc.getOutline();
  const walk = async (items: OutlineItems, depth: number): Promise<void> => {
    for (const item of items ?? []) {
      let page = 0;
      try {
        const dest = typeof item.dest === "string" ? await doc.getDestination(item.dest) : item.dest;
        const ref = Array.isArray(dest) ? dest[0] : null;
        if (ref) page = (await doc.getPageIndex(ref)) + 1;
      } catch {
        page = 0;
      }
      rows.push({ title: item.title, page, depth });
      if (item.items?.length) await walk(item.items, depth + 1);
    }
  };
  await walk(raw, 0);
  return rows;
}
