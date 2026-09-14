// EXPORT AS HTML: the open note as one file that needs nothing else.
//
// The reading renderer already knows how to turn the note into a page; the
// print module already knows how to get a settled, chrome-stripped copy of
// that page (documentForExport). What is left is to make the copy stand on
// its own once it is out of this tab, and that is three things:
//
//   THE THEME'S TOKENS, INLINED. The reading stylesheet paints everything
//   through `var(--…)`, and those are defined on `:root[data-theme]` by a
//   sheet the exported page will never load. So the token NAMES are read out
//   of the stylesheets on screen (every custom property a `:root` or
//   `[data-theme]` rule declares) and their VALUES out of
//   `getComputedStyle(document.documentElement)` — the room the reader is
//   in, whichever of the forty-six it is, resolved.
//
//   THE READING STYLESHEETS, INLINED. Every same-origin sheet whose text
//   mentions the reading classes (`.s-rv`, `.s-reading`, KaTeX's `.katex`)
//   is fetched — or, in dev, serialised from its rules — and dropped into a
//   <style>. `url(…)` references inside them are made absolute against the
//   sheet's own address, so a self-hosted webfont still resolves while the
//   instance is up rather than pointing at nothing.
//
//   THE PICTURES, INLINED WHERE THEY CAN BE. Every `<img>` the page serves
//   from `/api/file` is fetched and written back as a data: URI; one that
//   cannot be fetched keeps its URL, made absolute — the page then shows it
//   while the server is reachable and an honest broken image when it is
//   not. It is never dropped: a picture that silently vanished is the one
//   failure a reader cannot diagnose.

import { getNote } from "../api.ts";
import { liveNoteText } from "../editor/bufferBridge.ts";
import { getLang } from "../i18n.ts";
import { onScreenDoc, proseDirection, renderFor, settle, stripChrome, titleFor } from "../print.ts";
import { useStore } from "../state.ts";
import { noteTitleOf } from "../../shared/noteFormat.ts";

/** A picture above this is left as a URL: a 2 GB screen recording would
 *  otherwise be base64'd into a text file three times its size. */
const INLINE_MAX_BYTES = 25 * 1024 * 1024;

/** Only sheets that paint the document. The app shell's own rules (panes,
 *  the sidebar, the palette) are noise in a page that has none of them. */
const SHEET_MARKERS = [".s-rv", ".s-reading", ".katex", ".s-print", ".s-tex"];

function sameOrigin(url: string): boolean {
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

/** Every custom property a theme-defining rule declares, by name. Names, not
 *  values: the values come from the computed style, which is the only place
 *  the theme's cascade (custom.css, eye comfort, the builder) is settled. */
function tokenNames(): string[] {
  const names = new Set<string>();
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin: not ours, and it defines no token of ours
    }
    for (const rule of rules) {
      if (!(rule instanceof CSSStyleRule)) continue;
      if (!/:root|\[data-theme/.test(rule.selectorText)) continue;
      for (const prop of rule.style) if (prop.startsWith("--")) names.add(prop);
    }
  }
  return [...names].sort();
}

function tokensCss(): string {
  const computed = getComputedStyle(document.documentElement);
  const lines: string[] = [];
  for (const name of tokenNames()) {
    const value = computed.getPropertyValue(name).trim();
    if (value !== "") lines.push(`  ${name}: ${value};`);
  }
  return `:root {\n${lines.join("\n")}\n}`;
}

/** Make the `url(…)` references in a sheet absolute against `base`. */
function absolutizeUrls(css: string, base: string): string {
  return css.replace(/url\((['"]?)(?!data:|https?:|\/\/)([^'")]+)\1\)/g, (_m, q: string, ref: string) => {
    try {
      return `url(${q}${new URL(ref, base).href}${q})`;
    } catch {
      return _m;
    }
  });
}

/** The text of every same-origin sheet that paints the document. */
async function readingCss(): Promise<string> {
  const parts: string[] = [];
  for (const sheet of document.styleSheets) {
    let text: string | null = null;
    if (sheet.href) {
      if (!sameOrigin(sheet.href)) continue;
      try {
        const res = await fetch(sheet.href);
        if (res.ok) text = absolutizeUrls(await res.text(), sheet.href);
      } catch {
        text = null;
      }
    }
    if (text === null) {
      // No href (dev-server <style> injection, custom.css written inline), or
      // the fetch failed: the rules the browser already parsed are the next
      // best copy.
      try {
        text = absolutizeUrls([...sheet.cssRules].map((r) => r.cssText).join("\n"), location.href);
      } catch {
        continue;
      }
    }
    if (SHEET_MARKERS.some((marker) => text!.includes(marker))) parts.push(text);
  }
  return parts.join("\n\n");
}

/** A fetched file as a data: URI, or null when it is not ours to inline. */
async function toDataUri(url: string): Promise<string | null> {
  if (!sameOrigin(url)) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > INLINE_MAX_BYTES) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Every picture inlined where it can be; every other same-origin reference
 *  made absolute so the page keeps working beside a running instance. */
async function inlineMedia(doc: HTMLElement): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const img of doc.querySelectorAll<HTMLImageElement>("img[src]")) {
    const src = img.getAttribute("src") ?? "";
    if (src.startsWith("data:")) continue;
    const absolute = new URL(src, location.href).href;
    img.setAttribute("src", absolute);
    // The renderer's lazy hint would leave an inlined picture undecoded in
    // a viewer that never scrolls; the file is complete, so the page is.
    img.removeAttribute("loading");
    jobs.push(
      toDataUri(absolute).then((data) => {
        if (data !== null) img.setAttribute("src", data);
      }),
    );
  }
  for (const el of doc.querySelectorAll<HTMLElement>("a[href], source[src], video[src], audio[src], video[poster]")) {
    for (const attr of ["href", "src", "poster"]) {
      const value = el.getAttribute(attr);
      if (value && !value.startsWith("#") && !value.startsWith("data:")) {
        try {
          el.setAttribute(attr, new URL(value, location.href).href);
        } catch {
          /* an unparsable reference stays as written */
        }
      }
    }
  }
  await Promise.all(jobs);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The page's own rules: the ground, the measure, and nothing the reading
 *  sheet does not already say about the article. Stated inline rather than
 *  borrowed from app.css, which lays out an application. */
const PAGE_CSS = `
html { background: var(--bg); color: var(--text); }
body { margin: 0; font-family: var(--font-ui); line-height: 1.6; -webkit-text-size-adjust: 100%; }
.s-export-page { max-inline-size: 72ch; margin-inline: auto; padding-block: 2.5rem 4rem; padding-inline: 1.25rem; }
.s-export-page > h1 { font-family: var(--font-serif); font-weight: 500; }
`;

/** A rendered note as one settled, chrome-stripped document. The SAME three
 *  sources in the same order as the print (client/print.ts), and the same
 *  stripping, so the page a reader saves cannot disagree with the sheet they
 *  would have printed: a clone of what is on screen when the note is being
 *  read, else the live buffer, else the disk. A freshly rendered document is
 *  parked on <body> under a hidden stage while its lazy halves (math, cards,
 *  pictures) land, then removed — KaTeX and the tracker card hydrate a host
 *  that is in the tree, and a box with no layout loads no picture. */
async function documentForExport(path: string): Promise<{ doc: HTMLElement; dir: "ltr" | "rtl"; title: HTMLElement | null }> {
  const onScreen = onScreenDoc();
  let doc: HTMLElement;
  if (onScreen !== null && useStore.getState().openPath === path) {
    doc = onScreen.cloneNode(true) as HTMLElement;
  } else {
    const content = liveNoteText(path) ?? (await getNote(path)).content;
    doc = renderFor(path, content);
    const stage = document.createElement("div");
    stage.className = "s-export-stage";
    stage.setAttribute("aria-hidden", "true");
    stage.appendChild(doc);
    document.body.appendChild(stage);
    try {
      await settle(doc);
    } finally {
      stage.remove();
    }
  }
  stripChrome(doc);
  const dir = (doc.getAttribute("dir") as "ltr" | "rtl" | null) || proseDirection(doc);
  return { doc, dir, title: titleFor(doc, path) };
}

/** Build the standalone page for `path` and hand it to the browser as a
 *  download. Resolves with the file name it was saved under. */
export async function exportNoteAsHtml(path: string): Promise<string> {
  const { doc, dir, title } = await documentForExport(path);
  await inlineMedia(doc);
  // Furniture that only works with the app behind it: the properties card
  // is already gone (documentForExport), and a control inside a card — the
  // tracker stepper, a routine's tick — is a button a page cannot answer.
  for (const button of doc.querySelectorAll("button")) button.remove();
  const [tokens, sheets] = [tokensCss(), await readingCss()];
  const name = noteTitleOf(path);
  const theme = document.documentElement.getAttribute("data-theme") ?? "";
  const html = [
    "<!doctype html>",
    `<html lang="${escapeHtml(getLang())}" dir="${dir}"${theme ? ` data-theme="${escapeHtml(theme)}"` : ""}>`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(name)}</title>`,
    `<style>${tokens}</style>`,
    `<style>${sheets}</style>`,
    `<style>${PAGE_CSS}</style>`,
    "</head>",
    "<body>",
    '<main class="s-export-page">',
    title ? title.outerHTML : "",
    doc.outerHTML,
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
  const filename = `${name}.html`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // The object URL has to outlive the click by a tick or the download reads
  // an already-revoked blob in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return filename;
}
