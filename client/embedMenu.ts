// THE EMBED MENU — one menu for a picture, a file card, a drawn PDF page or a
// drawing, wherever it is drawn.
//
// Right-click, Shift+F10 / the Menu key, or a long press on the phone. The
// editor (client/editor/embedGrip.ts), the reading view (client/embedPickup.ts)
// and the phone's note screen all build their rows HERE, from the one
// availability table in shared/embedActions.ts, so the three surfaces offer the
// same verbs in the same order and none of them offers a row that does
// nothing: no clipboard, no Copy image; a visitor, only Copy link / Open /
// Save as; a broken embed, only what does not need the file.
//
// A lazy chunk: nobody pays for it until they right-click an embed.

import type { EditorView } from "@codemirror/view";
import {
  applyChanges,
  embedCopyStrings,
  embedMenuActions,
  embedSpanNear,
  findEmbedInLines,
  removeEmbedEdit,
  type EmbedAction,
} from "../shared/embedActions.ts";
import { isNotePath } from "../shared/noteFormat.ts";
import type { MenuAnchor, MenuRow } from "./components/ContextMenu.tsx";
import { openMenuPortal } from "./components/menuPortal.tsx";
import { promptModal } from "./components/Confirm.tsx";
import { TREE_REVEAL_EVENT } from "./components/Sidebar.tsx";
import { embedInfoOf, embedPathOf, type EmbedInfo } from "./embedPickup.ts";
import { fileUrl } from "./editor/embeds.ts";
import { resolveLink } from "./editor/links.ts";
import { t, tf, localeNum, type I18nKey } from "./i18n.ts";
import { checkName, nodeAt, parentDir, renameTo } from "./move.ts";
import { applyNoteContent, noteContent } from "./sectionActions.ts";
import { useStore } from "./state.ts";
import { toast } from "./toast.ts";

/** One embed, as the surface that drew it knows it. */
export interface EmbedMenuTarget {
  /** The note the embed is written in. */
  note: string;
  /** Its source, exactly as written. */
  source: string;
  /** What draws it — the picture Copy image reads from. */
  el: Element | null;
  surface: "editor" | "reading";
  /** The editor, when the editor drew it. */
  view?: EditorView;
  span: { from: number; to: number } | null;
  lines: [number, number] | null;
}

const LABEL: Record<EmbedAction, I18nKey> = {
  copyImage: "embedCopyImage",
  copyLink: "embedCopyLink",
  copyMarkdown: "embedCopyMarkdown",
  copyPath: "embedCopyPath",
  open: "embedOpen",
  goToPage: "embedGoToPageN",
  reveal: "embedReveal",
  saveAs: "embedSaveAs",
  move: "embedMove",
  rename: "embedRename",
  remove: "embedRemove",
};

function canCopyImage(): boolean {
  return typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";
}

function canCopyText(): boolean {
  return typeof navigator.clipboard?.writeText === "function";
}

/** Can the note behind this surface be written from here? */
function canEdit(target: EmbedMenuTarget): boolean {
  if (!useStore.getState().admin) return false;
  if (target.surface === "editor") return target.view !== undefined && !target.view.state.readOnly;
  return true;
}

async function copyText(text: string, ok: I18nKey): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(t(ok));
  } catch (err) {
    console.error("astrolabe: copying from an embed failed", err);
    toast(t("embedCopyFailed"), "error");
  }
}

/** A picture's PNG, however it is drawn: an <img> of any format (an svg
 *  drawing, a jpeg, a drawn PDF page's blob) or an inline <svg>. The clipboard
 *  takes PNG and nothing else everywhere, so everything goes through a canvas. */
async function pngOf(el: Element | null, url: string | null): Promise<Blob> {
  const img = el instanceof HTMLImageElement ? el : el?.querySelector("img") ?? null;
  const svg = !img ? (el instanceof SVGSVGElement ? el : el?.querySelector("svg") ?? null) : null;
  let src: string | null = img?.currentSrc || img?.src || url;
  let revoke: string | null = null;
  if (svg) {
    src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
    revoke = src;
  }
  if (!src) throw new Error("no picture");
  try {
    const pic = new Image();
    pic.decoding = "async";
    pic.src = src;
    await pic.decode();
    const box = (img ?? svg)?.getBoundingClientRect();
    const scale = Math.max(1, window.devicePixelRatio || 1);
    const w = pic.naturalWidth || Math.round((box?.width ?? 800) * scale);
    const h = pic.naturalHeight || Math.round((box?.height ?? 600) * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(pic, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no png"))), "image/png"));
  } finally {
    if (revoke) URL.revokeObjectURL(revoke);
  }
}

async function copyImage(el: Element | null, path: string | null): Promise<void> {
  try {
    // The promise, not the blob: Safari keeps the gesture's permission only
    // while the ClipboardItem is built inside it.
    const png = pngOf(el, path === null ? null : fileUrl(path));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    toast(t("embedImageCopied"));
  } catch (err) {
    console.error("astrolabe: copying a picture failed", err);
    toast(t("embedCopyFailed"), "error");
  }
}

function saveAs(path: string): void {
  const a = document.createElement("a");
  a.href = fileUrl(path);
  a.download = path.slice(path.lastIndexOf("/") + 1);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Open what the embed names in the place the app opens that kind of file:
 *  a book in the reader, a drawing in its canvas, a picture, a sound or
 *  anything else in the viewer. */
async function openEmbed(info: EmbedInfo, path: string): Promise<void> {
  const store = useStore.getState();
  if (info.kind === "drawing") {
    const drawing = resolveLink(info.target, store.tree);
    if (drawing) {
      store.openNote(drawing);
      return;
    }
  }
  if (/\.(pdf|epub)$/i.test(path)) {
    const door = await import("./books/door.ts");
    door.openBookPath(path);
    return;
  }
  const node = nodeAt(store.tree, path);
  if (!node || node.type !== "file") {
    window.open(fileUrl(path), "_blank", "noopener");
    return;
  }
  const [{ createRoot }, viewer, { createElement }] = await Promise.all([
    import("react-dom/client"),
    import("./components/AttachmentViewer.tsx"),
    import("react"),
  ]);
  if (!viewer.isViewable(node)) {
    window.open(fileUrl(path), "_blank", "noopener");
    return;
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const close = (): void => {
    queueMicrotask(() => {
      root.unmount();
      host.remove();
    });
  };
  root.render(createElement(viewer.default, { items: [node], index: 0, onIndex: () => {}, onClose: close }));
}

/** Show the file's row in the tree: the sidebar opened, its folders unfolded,
 *  the attachment filter lifted if it was hiding the row. */
function reveal(info: EmbedInfo, path: string): void {
  const store = useStore.getState();
  const row = info.kind === "drawing" ? resolveLink(info.target, store.tree) ?? path : path;
  store.setSidebarCollapsed(false);
  requestAnimationFrame(() =>
    window.dispatchEvent(new CustomEvent(TREE_REVEAL_EVENT, { detail: { path: row, attachment: !isNotePath(row) } })),
  );
}

async function rename(path: string): Promise<void> {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const item = { path, name, isFolder: false };
  const dir = parentDir(path);
  const picked = await promptModal({
    title: tf("embedRenameTitle", { name }),
    value: name,
    confirmLabel: t("rename"),
    check: (raw) => checkName(item, dir, raw),
  });
  if (picked) await renameTo(item, picked.slice(picked.lastIndexOf("/") + 1));
}

/** Take the embed out of its note — the line, or the embed's own words. */
async function removeEmbed(target: EmbedMenuTarget): Promise<void> {
  const view = target.view;
  if (target.surface === "editor" && view) {
    const doc = view.state.doc.toString();
    const near = target.span ? embedSpanNear(doc, target.span.from) : null;
    const span = near && near.source === target.source ? near : null;
    if (!span) return;
    const edit = removeEmbedEdit(doc, span);
    view.dispatch({ changes: edit.changes, selection: { anchor: edit.at }, userEvent: "delete" });
    view.focus();
    return;
  }
  const content = await noteContent(target.note);
  const span =
    (target.lines && findEmbedInLines(content, target.source, target.lines[0], target.lines[1])) ||
    (content.includes(target.source) ? { from: content.indexOf(target.source), to: content.indexOf(target.source) + target.source.length } : null);
  if (!span) return;
  await applyNoteContent(target.note, applyChanges(content, removeEmbedEdit(content, span).changes));
}

export interface EmbedVerb {
  action: EmbedAction | null;
  label: string;
  danger?: boolean;
  run(): void;
}

/** The menu's rows for one embed — the desktop menu and the phone's sheet
 *  both draw these. `touch` swaps Reveal (there is no sidebar under a
 *  finger) for Move…, whose `onMove` the phone supplies. */
export async function embedVerbs(target: EmbedMenuTarget, opts: { touch: boolean; onMove?: () => void }): Promise<{ title: string; verbs: EmbedVerb[] } | null> {
  const info = embedInfoOf(target.source, target.note);
  if (!info) return null;
  const store = useStore.getState();
  const resolving = embedPathOf(info);
  const path = resolving instanceof Promise ? await resolving : resolving;
  const actions = embedMenuActions({
    kind: info.kind,
    admin: store.admin,
    resolved: path !== null,
    clipboardImage: canCopyImage(),
    clipboardText: canCopyText(),
    canEdit: canEdit(target),
    touch: opts.touch,
  }).filter((a) => a !== "move" || opts.onMove !== undefined);
  const strings = embedCopyStrings(target.source, path, location.origin);
  const verbs: EmbedVerb[] = [];
  for (const action of actions) {
    if (action === null) {
      verbs.push({ action: null, label: "", run: () => {} });
      continue;
    }
    const label = action === "goToPage" && info.page !== null ? tf("embedGoToPageN", { page: localeNum(info.page) }) : t(LABEL[action]);
    const run = (): void => {
      switch (action) {
        case "copyImage":
          void copyImage(target.el, path);
          return;
        case "copyLink":
          if (strings.link) void copyText(strings.link, "embedLinkCopied");
          return;
        case "copyMarkdown":
          void copyText(strings.markdown, "embedMarkdownCopied");
          return;
        case "copyPath":
          if (strings.path) void copyText(strings.path, "embedPathCopied");
          return;
        case "open":
          if (path) void openEmbed(info, path);
          return;
        case "goToPage":
          if (path && info.page !== null) {
            const page = info.page;
            void import("./books/door.ts").then((door) => door.openBookPage(path, page));
          }
          return;
        case "reveal":
          if (path) reveal(info, path);
          return;
        case "saveAs":
          if (path) saveAs(path);
          return;
        case "move":
          opts.onMove?.();
          return;
        case "rename":
          if (path) void rename(path);
          return;
        case "remove":
          void removeEmbed(target);
          return;
      }
    };
    verbs.push({ action, label, danger: action === "remove", run });
  }
  const title = path ? path.slice(path.lastIndexOf("/") + 1) : info.target;
  return { title, verbs };
}

/** Open the desktop menu for an embed at a viewport point. */
export async function openEmbedMenu(target: EmbedMenuTarget, at: MenuAnchor): Promise<void> {
  const got = await embedVerbs(target, { touch: false });
  if (!got || got.verbs.length === 0) return;
  const rows: MenuRow[] = got.verbs.map((v) => (v.action === null ? { label: null } : { label: v.label, danger: v.danger, onSelect: v.run }));
  openMenuPortal({ at, rows, label: tf("embedMenuLabel", { name: got.title }) });
}
