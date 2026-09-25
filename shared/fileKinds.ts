// WHAT A FILE IS, BY ITS NAME — the extension, whether a page can draw it,
// and the kind the tree marks it with. Split from shared/attachments.ts so a
// chunk that only asks "is this a picture?" (the editor's embeds, on first
// paint) does not carry the upload tables with it. Pure, no I/O.

import type { AttachmentKind } from "./types.ts";

/** Lower-cased extension of a filename, without the dot ("" when there is none). */
export function extensionOf(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
}

/** Extensions a browser draws in an <img> — the one image test. Deliberately
 *  not `heic` or `tif`: those are images the tree marks as pictures but a
 *  page cannot show, so no validator may accept one as a banner or a logo. */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "ico"] as const;
export type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];
const IMAGE_SET: ReadonlySet<string> = new Set(IMAGE_EXTENSIONS);

/** True when `path` names a picture a page can draw. */
export function isImagePath(path: string): boolean {
  return IMAGE_SET.has(extensionOf(path));
}

/** The kind of a vault file, for the tree's marker and the viewer. */
const KINDS: Readonly<Record<string, AttachmentKind>> = {
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", avif: "image",
  svg: "image", bmp: "image", ico: "image", tif: "image", tiff: "image", heic: "image",
  pdf: "book", epub: "book",
  mp3: "audio", m4a: "audio", wav: "audio", ogg: "audio", oga: "audio", flac: "audio", aac: "audio", opus: "audio",
  mp4: "video", webm: "video", mov: "video", mkv: "video", m4v: "video", ogv: "video",
};

/** The kind of a vault file by its extension. */
export function attachmentKindOf(path: string): AttachmentKind {
  return KINDS[extensionOf(path)] ?? "other";
}
