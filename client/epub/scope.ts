// A CHAPTER, TAKEN APART INTO A STYLESHEET AND A BODY.
//
// What comes back from /api/books/epub/item is one `text/html` document: the
// chapter's own CSS in a leading `<style>`, then the markup the server rebuilt
// from its allowlist (server/epub.ts). Both halves still have to be made local
// before either touches the page, and this is the twenty lines that do it.
//
// THE PARSE IS INERT. `<template>.innerHTML` builds a document fragment whose
// contents are NOT in a document: no script runs (the sanitizer removed them
// anyway; this is the second lock), no image is fetched, no stylesheet is
// applied. The images begin loading at the moment the reader ADOPTS the
// fragment into the page, which is exactly when a chapter is on screen and
// exactly when they should.
//
// THE CSS IS PREFIXED, not shadowed. shared/epubCss.ts carries the argument at
// length; the short version is that a shadow root would cut the book off from
// the theme tokens, from the Selection a citation is made of, from `dir`
// inheritance and from the browser's own find — for a scoping property that a
// string prefix gives for free and that a unit test can check.

import { scopeEpubCss } from "../../shared/epubCss.ts";

export interface Chapter {
  /** The publisher's CSS, every selector prefixed with the reader's root. */
  css: string;
  /** The chapter's markup, with the `<style>` blocks taken out of it. */
  body: string;
}

/**
 * Split one chapter document into its stylesheet and its body.
 *
 * `prefix` is the selector the whole sheet is confined to — in practice
 * `.s-epub__chapter`, which every chapter box wears. One prefix for all
 * chapters rather than one per chapter: two chapters of the same book share a
 * stylesheet, and prefixing it per chapter would mean holding thirty copies of
 * the same three kilobytes and re-parsing them on every scroll.
 */
export function splitChapter(html: string, prefix: string): Chapter {
  const template = document.createElement("template");
  template.innerHTML = html;
  const sheets: string[] = [];
  for (const style of Array.from(template.content.querySelectorAll("style"))) {
    sheets.push(style.textContent ?? "");
    style.remove();
  }
  // And anything else that could still fetch or run, in case a future change
  // to the sanitizer lets one through: this is a second lock on the same door,
  // and it costs one query.
  for (const el of Array.from(template.content.querySelectorAll("script, link, iframe, object, embed"))) {
    el.remove();
  }
  const holder = document.createElement("div");
  holder.appendChild(template.content);
  return { css: scopeEpubCss(sheets.join("\n"), prefix), body: holder.innerHTML };
}

/**
 * The text of a rendered chapter, flattened, with a map back to the nodes.
 *
 * The server's search hits carry an offset into the chapter's TEXT, which is
 * the only kind of offset it can give: it never saw this DOM. So the reader
 * walks the same text here and turns the offset back into a Range. The
 * flattening rule has to match `server/epub.ts::chapterText` — a block
 * element is a space, everything else is its characters — or the k-th hit the
 * server found and the k-th offset this walk lands on are two different
 * places in the chapter.
 */
export function chapterRanges(host: HTMLElement): { text: string; nodes: Array<{ node: Text; start: number }> } {
  const BLOCKS = /^(P|DIV|H[1-6]|LI|TR|BR|SECTION|BLOCKQUOTE|FIGURE|FIGCAPTION|TD|TH)$/;
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const nodes: Array<{ node: Text; start: number }> = [];
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (BLOCKS.test((node as Element).tagName)) text += " ";
      continue;
    }
    const textNode = node as Text;
    nodes.push({ node: textNode, start: text.length });
    text += textNode.data;
  }
  return { text, nodes };
}

/** The whitespace collapse `chapterText` applies, as an offset map: the
 *  server searched a string with runs of whitespace squeezed to one space, so
 *  an offset into THAT has to be walked back to an offset into this one. */
export function collapsedOffsets(text: string): { collapsed: string; at: number[] } {
  const out: string[] = [];
  const at: number[] = [];
  let space = true; // leading whitespace is trimmed, like `.trim()`
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (space) continue;
      space = true;
      out.push(" ");
      at.push(i);
      continue;
    }
    space = false;
    out.push(ch);
    at.push(i);
  }
  // A trailing space belongs to no character, exactly as `.trim()` says.
  while (out.length > 0 && out[out.length - 1] === " ") {
    out.pop();
    at.pop();
  }
  return { collapsed: out.join(""), at };
}

/** A Range over `[from, to)` of a chapter's flattened text, or null when the
 *  offsets fall outside it. */
export function rangeAt(
  nodes: ReadonlyArray<{ node: Text; start: number }>,
  from: number,
  to: number,
): Range | null {
  const locate = (offset: number): { node: Text; at: number } | null => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const entry = nodes[i];
      if (offset >= entry.start && offset <= entry.start + entry.node.data.length) {
        return { node: entry.node, at: offset - entry.start };
      }
    }
    return null;
  };
  const start = locate(from);
  const end = locate(Math.max(from, to));
  if (start === null || end === null) return null;
  const range = document.createRange();
  range.setStart(start.node, start.at);
  range.setEnd(end.node, end.at);
  return range;
}
