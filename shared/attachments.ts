// Attachment policy — the one place client and server agree on WHAT may be
// uploaded and WHERE it lands. Both halves need it: the server enforces
// (bytes are sniffed, paths are re-validated), the client refuses locally so a
// file the server would reject is never put on the wire and the reader hears
// why while the drop is still in their hand.

// ── Where new attachments go ────────────────────────────────────────────────
// The four modes are Obsidian's "Default location for new attachments", named
// the same way so a migrating vault owner finds what they expect:
//
//   vault-root   → the vault's top level
//   same-folder  → beside the note being edited
//   subfolder    → a named subfolder OF the note's folder ("assets")
//   specified    → one fixed vault-relative folder ("attachments") — the
//                  behaviour every Astrolabe instance had before this setting,
//                  and therefore the default.
//
// Nothing already on disk moves when this changes: it decides where the NEXT
// upload is written, and existing embeds keep resolving by basename anyway.

import { extensionOf } from "./fileKinds.ts";
// What a file IS by its name — its extension, whether it is a picture, its
// kind — lives in shared/fileKinds.ts, a module small enough for the entry
// chunk (the editor's embeds ask `isImagePath` on first paint); re-exported
// here, where the product has always asked for it.
export { attachmentKindOf, extensionOf, IMAGE_EXTENSIONS, isImagePath, type ImageExtension } from "./fileKinds.ts";

export type AttachmentMode = "vault-root" | "same-folder" | "subfolder" | "specified";

export const ATTACHMENT_MODES: readonly AttachmentMode[] = [
  "vault-root",
  "same-folder",
  "subfolder",
  "specified",
];

export function isAttachmentMode(value: unknown): value is AttachmentMode {
  return typeof value === "string" && (ATTACHMENT_MODES as readonly string[]).includes(value);
}

/** The resolved policy: a mode plus the folder name the two folder-bearing
 *  modes use ("attachments" by default — i.e. ATTACHMENTS_DIR). */
export interface AttachmentLocation {
  mode: AttachmentMode;
  folder: string;
}

/** True when a mode reads the `folder` value at all (the UI greys the field
 *  out for the other two rather than pretending it matters). */
export function modeUsesFolder(mode: AttachmentMode): boolean {
  return mode === "subfolder" || mode === "specified";
}

/** Canonical vault-relative form of a folder value: backslashes to slashes,
 *  leading/trailing slashes trimmed, "." segments dropped. Cheap and total —
 *  it never throws; `folderError` is what judges the result. */
export function normalizeFolder(value: string): string {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .map((seg) => seg.trim())
    .filter((seg) => seg !== "" && seg !== ".")
    .join("/");
}

/** Why a folder value is unusable, or null when it is fine. The reasons are
 *  keys, not sentences: the client maps them to localized copy, the server to
 *  a 400 message. Empty is allowed and means "the vault root". */
export type FolderProblem = "traversal" | "absolute" | "dotfolder" | "control" | "tooLong";

export function folderError(value: string): FolderProblem | null {
  const raw = value.trim();
  if (raw === "") return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "control";
  if (raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw)) return "absolute";
  const rel = normalizeFolder(raw);
  if (rel.length > 180) return "tooLong";
  const segments = rel.split("/");
  if (segments.includes("..")) return "traversal";
  // Dot-folders are invisible to the tree, the indexer and the watcher, so an
  // attachment written into one would silently never resolve again.
  if (segments.some((seg) => seg.startsWith("."))) return "dotfolder";
  return null;
}

/** The vault-relative directory an upload lands in, given the policy and the
 *  folder the upload happened IN (the open note's folder, the tree row that
 *  was dropped on). `contextDir` is "" for the vault root, and an unknown
 *  context degrades gracefully to the root rather than guessing. */
/**
 * WHERE AN UPLOAD LANDS, given where it was dropped and whether that was a
 * choice.
 *
 * `resolveAttachmentDir` below answers for an ATTACHMENT — a paste or a drop
 * INTO A NOTE, where the reader named no place and the location setting
 * decides. A drop on the TREE is different: the reader aimed at a folder, and
 * the folder is the answer, whatever the file is. It used to be so only for
 * PDFs (the owner dragged a book onto `Library/` and found it in
 * `attachments/`); then a friend dropped a folder of icons on a folder and
 * every one of them was carried off to `attachments/` too. The owner's rule
 * now: "only auto attachments when the user pastes or drops directly on the
 * note; if I drag and drop an image to a folder then my choice shall be
 * honoured."
 *
 * `filed` is the CLIENT's statement that the drop was a filing (a tree drop,
 * as opposed to a paste into a note). `ext` is the SERVER's sniffed type and
 * is kept in the signature for the callers and tests that already pass it.
 */
export function uploadDestination(
  loc: AttachmentLocation,
  contextDir: string,
  _ext: string,
  filed: boolean,
): string {
  if (filed) return normalizeFolder(contextDir);
  return resolveAttachmentDir(loc, contextDir);
}

export function resolveAttachmentDir(loc: AttachmentLocation, contextDir: string): string {
  const context = normalizeFolder(contextDir);
  const folder = normalizeFolder(loc.folder);
  switch (loc.mode) {
    case "vault-root":
      return "";
    case "same-folder":
      return context;
    case "subfolder":
      return folder === "" ? context : context === "" ? folder : `${context}/${folder}`;
    case "specified":
      return folder;
  }
}

// ── What may be uploaded ────────────────────────────────────────────────────
// Obsidian's vault holds more than images — a PDF of the paper being annotated,
// the interview recording a note transcribes — and `![[file.pdf]]` already
// renders and downloads through /api/file. The wire list below is what the
// uploader accepts; the server still sniffs the BYTES (extension and
// Content-Type are attacker-controlled), so this list bounds the client's
// optimism, never the server's trust.

/** Accepted extension → the MIME type an <input accept=…> should advertise.
 *  Aliases (jpeg, m4v, oga) map to the same family and are kept as typed. */
export const ATTACHMENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  heic: "image/heic",
  bmp: "image/bmp",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  // 3.32: films are embeds now (client/reading/video.ts), so the two
  // containers the tree already called "video" are uploads too.
  mkv: "video/x-matroska",
  ogv: "video/ogg",
};


/** Every MIME type the table advertises, for the type-only fallback below —
 *  built on first use, not at module load: a `new Set` at the top level is a
 *  side effect a bundler must keep, and it would drag this table into every
 *  chunk that only wanted `isImagePath` (the editor's embeds are in the entry). */
let acceptedMime: ReadonlySet<string> | null = null;

/** True when the uploader will even try this file. The extension decides
 *  first — a browser hands us `application/octet-stream` for half of these
 *  types — but a file with NO usable extension is judged by its MIME instead:
 *  an image pasted from the clipboard often arrives as a nameless blob, and
 *  refusing that would break the oldest upload path in the app. The server's
 *  byte sniff is the real gate either way. */
export function isAcceptedAttachment(name: string, type = ""): boolean {
  const ext = extensionOf(name);
  if (ext !== "") return Object.prototype.hasOwnProperty.call(ATTACHMENT_TYPES, ext);
  acceptedMime ??= new Set(Object.values(ATTACHMENT_TYPES));
  return acceptedMime.has(type.trim().toLowerCase());
}

// ── What a file IS: its served type, its kind, whether it is a picture ───────
// One table each, read by the server's /api/file, the pocket's, the tree on
// both, the settings and design validators, the banner picker and the
// editor's embed. There were two MIME tables (server/api.ts and the pocket's
// reading of ATTACHMENT_TYPES above) that disagreed about `.ico`, `.tif`,
// `.mkv`, `.txt`, `.json`, and six image-extension regexes that disagreed about
// `.bmp`, `.ico` and `.avif`.

/** Extension (lowercase, no dot) → the Content-Type a file is SERVED with.
 *  A superset of ATTACHMENT_TYPES: the vault holds files nobody uploaded
 *  through the app (an `.ico` a site uses, a `.canvas` from Obsidian). */
export const MIME_TYPES: Readonly<Record<string, string>> = {
  ...ATTACHMENT_TYPES,
  ico: "image/x-icon",
  tif: "image/tiff",
  tiff: "image/tiff",
  epub: "application/epub+zip",
  aac: "audio/aac",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  json: "application/json",
  canvas: "application/json",
};

/** The Content-Type a vault file is served with; octet-stream when unknown. */
export function contentTypeFor(path: string): string {
  return MIME_TYPES[extensionOf(path)] ?? "application/octet-stream";
}
