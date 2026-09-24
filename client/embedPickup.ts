// PICKING AN EMBED UP — the drag, on both surfaces.
//
// A picture, a file card, a drawn PDF page or a drawing in a note can be
// dragged: within its note (the line moves), into another pane's note (the
// same `![[…]]` is inserted there — a reference, never a copy of the file), and
// out of the app, where the drag carries the FILE:
//
//   · `DownloadURL` (Chromium and the desktop shell): `mime:name:url`, which a
//     file manager or the desktop turns into the file itself;
//   · `text/uri-list` and `text/plain`: the file's absolute URL, which every
//     other target understands (a browser tab, a chat box, a mail body);
//   · in the desktop app, ALT+drag hands the gesture to the OS through the
//     bridge (`startDrag`, electron/main.ts) so the drop receives the real file
//     on disk — the tree's rule for its own rows (client/desktop/index.ts). A
//     bare drag stays the app's, because startDrag takes the gesture over and
//     no in-app target would see it again.
//
// The payload rides the DataTransfer under EMBED_MIME and ALSO sits in this
// module, because `getData()` is empty during `dragover` (protected mode) and a
// drop target has to know what is hovering it before the drop. The editor's
// half is client/editor/embedGrip.ts; the reading view's half is below. The
// arithmetic of both is shared/embedActions.ts.

// Types only: the arithmetic (shared/embedActions.ts) is fetched at the drop,
// so the reading view's first paint carries the listeners and nothing else.
import type { DropSpot, EmbedKind, LiftedEmbed } from "../shared/embedActions.ts";
import { drawingSvgName, parseEmbed, resolveAttachment } from "./editor/embeds.ts";
import { applyNoteContent, noteContent } from "./sectionActions.ts";
import { useStore } from "./state.ts";

export const EMBED_MIME = "application/x-astrolabe-embed";

/** What is being carried: the embed as the arithmetic knows it, and the
 *  vault path of its file when that was known at lift time. */
export interface EmbedPayload extends LiftedEmbed {
  path: string | null;
}

/** An embed as the menu and the drag see it: what it draws as, the file it
 *  names, and (for a page) which page. Null for a note transclusion. */
export interface EmbedInfo {
  kind: EmbedKind;
  /** The name the source uses (`pic.png`, `media/pic.png`, `Book.pdf`). */
  target: string;
  page: number | null;
  /** A markdown image's destination, already resolved to a vault path. */
  mdPath: string | null;
}

export function embedInfoOf(source: string, note: string): EmbedInfo | null {
  if (source.startsWith("![[")) {
    const parts = parseEmbed(source.slice(3, -2));
    if (parts.kind === "note") return null;
    return { kind: parts.kind, target: parts.target, page: parts.page, mdPath: null };
  }
  const m = /^!\[[^\]]*\]\((<[^<>]*>|[^)\s]+)/.exec(source);
  if (!m) return null;
  const raw = m[1].replace(/^<|>$/g, "");
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return { kind: "image", target: raw, page: null, mdPath: null };
  }
  let decoded = raw.replace(/[?#].*$/, "");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // a stray % is not an encoding
  }
  const parts = decoded.startsWith("/") ? [] : note.includes("/") ? note.slice(0, note.lastIndexOf("/")).split("/") : [];
  for (const seg of decoded.replace(/^\/+/, "").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  const path = parts.join("/");
  return { kind: "image", target: path, page: null, mdPath: path };
}

/** The vault path of the file an embed draws — the picture a drawing
 *  exports, for a drawing. Synchronous when the resolver already knows
 *  (every embed on screen has been resolved once to be drawn). */
export function embedPathOf(info: EmbedInfo): string | null | Promise<string | null> {
  if (info.mdPath !== null) return info.mdPath;
  if (/^[a-z][a-z0-9+.-]*:/i.test(info.target)) return null;
  return resolveAttachment(info.kind === "drawing" ? drawingSvgName(info.target) : info.target);
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  webm: "audio/webm",
  mp4: "video/mp4",
  zip: "application/zip",
  epub: "application/epub+zip",
};

export function mimeOf(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

let current: EmbedPayload | null = null;

/** The embed this window is dragging, or the one a drop carries from another
 *  window (readable only on drop). */
export function liftedEmbed(dt?: DataTransfer | null): EmbedPayload | null {
  // The DataTransfer's TYPES are the truth (readable in every drag event):
  // `current` can outlive its drag when the lifted element was re-rendered
  // away and its `dragend` never reached anyone.
  if (dt && !dt.types.includes(EMBED_MIME)) return null;
  if (current !== null) return current;
  if (!dt) return null;
  try {
    const raw = dt.getData(EMBED_MIME);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<EmbedPayload>;
    if (typeof p.note !== "string" || typeof p.source !== "string") return null;
    return { note: p.note, source: p.source, span: p.span ?? null, lines: p.lines ?? null, path: p.path ?? null };
  } catch {
    return null;
  }
}

/** Does this drag carry an embed (ours, or another window's)? */
export function dragCarriesEmbed(dt: DataTransfer | null): boolean {
  return dt?.types.includes(EMBED_MIME) ?? false;
}

/** Start a drag. Returns false when the desktop took the gesture to the OS. */
export function beginEmbedDrag(ev: DragEvent, payload: EmbedPayload, ghost: Element | null): boolean {
  const dt = ev.dataTransfer;
  if (!dt) return false;
  const bridge = window.astrolabeDesktop;
  if (bridge && ev.altKey && payload.path !== null) {
    ev.preventDefault();
    void bridge.dragNote(payload.path);
    return false;
  }
  current = payload;
  dt.effectAllowed = "copyMove";
  dt.setData(EMBED_MIME, JSON.stringify(payload));
  if (payload.path !== null) {
    const url = `${location.origin}/api/file?path=${encodeURIComponent(payload.path)}`;
    const name = payload.path.slice(payload.path.lastIndexOf("/") + 1);
    dt.setData("DownloadURL", `${mimeOf(payload.path)}:${name}:${url}`);
    dt.setData("text/uri-list", url);
    dt.setData("text/plain", url);
  } else {
    dt.setData("text/plain", payload.source);
  }
  if (ghost instanceof HTMLElement) {
    const box = ghost.getBoundingClientRect();
    try {
      dt.setDragImage(ghost, Math.min(24, box.width / 2), Math.min(24, box.height / 2));
    } catch {
      // some elements cannot be a drag image; the browser's default is fine
    }
  }
  return true;
}

export function endEmbedDrag(): void {
  current = null;
  hideDropLine();
}

// ── the reading view's half ─────────────────────────────────────────────────

const EMBED_SEL = "[data-embed-src]";
const READING_SEL = ".s-reading[data-note-path]";

function readingHost(el: EventTarget | null): HTMLElement | null {
  return el instanceof Element ? el.closest<HTMLElement>(READING_SEL) : null;
}

function embedEl(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>(EMBED_SEL);
  if (!el || !readingHost(el)) return null;
  // A transcluded note's own embeds belong to THAT note, not this one.
  if (el.closest(".s-rv-transclude")) return null;
  return el;
}

/** The top-level block a reading-view element sits in, with its lines. */
function blockOf(el: Element): { el: HTMLElement; start: number; end: number } | null {
  const block = el.closest<HTMLElement>("[data-src-start]");
  if (!block) return null;
  return { el: block, start: Number(block.dataset.srcStart), end: Number(block.dataset.srcEnd) };
}

let dropLine: HTMLElement | null = null;

function showDropLine(rect: { left: number; width: number; y: number }): void {
  if (!dropLine) {
    dropLine = document.createElement("div");
    dropLine.className = "s-embed-dropline";
    dropLine.setAttribute("aria-hidden", "true");
    document.body.appendChild(dropLine);
  }
  dropLine.style.left = `${Math.round(rect.left)}px`;
  dropLine.style.width = `${Math.round(rect.width)}px`;
  dropLine.style.top = `${Math.round(rect.y - 1)}px`;
}

function hideDropLine(): void {
  dropLine?.remove();
  dropLine = null;
}

/** The block boundary nearest the pointer in a reading view: before the
 *  block under it when the pointer is in its top half, after it otherwise;
 *  after the last block when the pointer is below them all. */
function readingSpot(host: HTMLElement, y: number): { spot: DropSpot; line: { left: number; width: number; y: number } } | null {
  const content = host.querySelector<HTMLElement>(".s-reading__content");
  if (!content) return null;
  const blocks = [...content.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.dataset.srcStart !== undefined);
  if (blocks.length === 0) return null;
  let pick = blocks[blocks.length - 1];
  for (const b of blocks) {
    const r = b.getBoundingClientRect();
    if (y <= r.bottom) {
      pick = b;
      break;
    }
  }
  const r = pick.getBoundingClientRect();
  const before = y < r.top + r.height / 2;
  const lineY = before ? r.top - 4 : r.bottom + 4;
  return {
    spot: before ? { line: Number(pick.dataset.srcStart), after: false } : { line: Number(pick.dataset.srcEnd), after: true },
    line: { left: r.left, width: r.width, y: lineY },
  };
}

let installed = false;

/** Install the reading view's drag and menu handlers (idempotent). Delegated
 *  on the document, like the heading menu (reading/headingMenu.ts): the
 *  reading view is imperative DOM rebuilt on every render. */
export function installEmbedPickup(): void {
  if (installed) return;
  installed = true;

  // An image drags natively; a figure, a drawn svg and a card's parts do not.
  // Made draggable at the press, so whatever the renderer swapped in since is
  // covered too — by a POINTER only: a finger's long press is the phone's
  // sheet (client/phone/embedSheet.ts), and a draggable element under a
  // finger turns that press into a drag on Android.
  document.addEventListener(
    "pointerdown",
    (ev) => {
      const el = embedEl(ev.target);
      if (el && ev.button === 0) el.draggable = ev.pointerType !== "touch";
    },
    true,
  );

  document.addEventListener("dragstart", (ev) => {
    const el = embedEl(ev.target);
    if (!el) return;
    const host = readingHost(el);
    const note = host?.dataset.notePath;
    const source = el.dataset.embedSrc;
    if (!note || !source) return;
    const info = embedInfoOf(source, note);
    if (!info) return;
    const block = blockOf(el);
    const resolved = embedPathOf(info);
    beginEmbedDrag(
      ev,
      {
        note,
        source,
        span: null,
        lines: block ? [block.start, block.end] : null,
        path: typeof resolved === "string" ? resolved : null,
      },
      el,
    );
  });

  document.addEventListener("dragend", () => endEmbedDrag());

  document.addEventListener("dragover", (ev) => {
    if (!dragCarriesEmbed(ev.dataTransfer)) return;
    const host = readingHost(ev.target);
    if (!host) {
      hideDropLine();
      return;
    }
    if (!useStore.getState().admin) return;
    const at = readingSpot(host, ev.clientY);
    if (!at) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = liftedEmbed(ev.dataTransfer)?.note === host.dataset.notePath ? "move" : "copy";
    showDropLine(at.line);
  });

  document.addEventListener("drop", (ev) => {
    const host = readingHost(ev.target);
    const payload = liftedEmbed(ev.dataTransfer);
    hideDropLine();
    if (!host || !payload) return;
    endEmbedDrag();
    if (!useStore.getState().admin) return;
    const target = host.dataset.notePath;
    const at = readingSpot(host, ev.clientY);
    if (!target || !at) return;
    ev.preventDefault();
    void (async () => {
      const [{ applyChanges, landEmbed }, content] = await Promise.all([import("../shared/embedActions.ts"), noteContent(target)]);
      const edit = landEmbed(content, target, payload, at.spot);
      if (edit !== null) await applyNoteContent(target, applyChanges(content, edit.changes));
    })();
  });

  document.addEventListener("contextmenu", (ev) => {
    const el = embedEl(ev.target);
    if (!el) return;
    const host = readingHost(el);
    const note = host?.dataset.notePath;
    const source = el.dataset.embedSrc;
    if (!note || !source || !embedInfoOf(source, note)) return;
    // A selection across the picture is a selection: the browser's menu
    // copies it better than ours would.
    if ((window.getSelection()?.toString() ?? "").trim() !== "") return;
    ev.preventDefault();
    const block = blockOf(el);
    const box = el.getBoundingClientRect();
    const fromKeyboard = ev.button !== 2;
    const x = fromKeyboard ? box.left + Math.min(24, box.width / 2) : ev.clientX;
    const y = fromKeyboard ? box.top + Math.min(24, box.height / 2) : ev.clientY;
    void import("./embedMenu.ts").then((m) =>
      m.openEmbedMenu(
        { note, source, el, surface: "reading", span: null, lines: block ? [block.start, block.end] : null },
        { x, y, fromKeyboard },
      ),
    );
  });
}

/** Make the reading view's embeds reachable from the keyboard, so Shift+F10
 *  and the Menu key have something to open the menu ON. A link (a file card,
 *  a page's caption) already is; a picture gets a tab stop. */
export function focusableEmbeds(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>(EMBED_SEL)) {
    if (el.closest(".s-rv-transclude")) continue;
    const pic = el.matches("img, svg") ? el : el.querySelector<HTMLElement>("img");
    if (pic && pic.tabIndex < 0) pic.tabIndex = 0;
  }
}
