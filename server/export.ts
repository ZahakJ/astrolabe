// EXPORT: the way out of the vault that is not a printer.
//
// `GET /api/export` answers with a ZIP of the notes a scope names — one
// note, a folder, a tag, the whole vault — and the attachments they
// reference, as the bytes sit on disk. The vault is never touched; when the
// caller asks for `links=relative`, the COPIES in the archive have their
// `[[wikilinks]]` rewritten to standard relative Markdown links
// (shared/exportLinks.ts) and the originals keep theirs.
//
// Three shapes this module takes, and why:
//
//   PLAN, THEN STREAM. The selection is answered by the index (it already
//   knows every note's links, assets, banner and covers — nothing is
//   re-parsed here), every file is stat'ed up front, and the sum is checked
//   against the cap BEFORE the first byte goes out. A 413 after 1.9 GB of
//   download is not an error message, it is a wasted afternoon; a 413 in
//   the first millisecond is.
//
//   CONSTANT MEMORY. The ZIP writer (shared/zip.ts) takes chunks and writes
//   the CRC after the data, so a file is read through a stream and handed
//   on chunk by chunk. The only file ever held whole is a Markdown note being
//   rewritten, and the index already refuses to read a note above its own
//   size cap.
//
//   THE ARCHIVE'S PATHS ARE THE VAULT'S. `Folder/Note.md` inside the zip,
//   whatever the scope, so a relative link written for the vault is a
//   relative link that works after extraction — and so that unzipping two
//   exports into one folder recreates the vault's own layout rather than two
//   competing ones.

import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { rewriteWikilinks, type LinkResolver } from "../shared/exportLinks.ts";
import { EXPORT_MAX_BYTES } from "../shared/limits.ts";
import { isNotePath, isTexPath, noteTitleOf } from "../shared/noteFormat.ts";
import type { ExportLinkStyle, ExportScope, ExportSummary } from "../shared/types.ts";
import { ZipWriter } from "../shared/zip.ts";
import { exportSelection, resolveEmbed } from "./indexer.ts";
import { assertNotePath, normalizeRel, safeAbs, VaultError } from "./vault.ts";

export interface ExportRequest {
  scope: ExportScope;
  /** The note path, the folder path, or the tag — "" for the vault. */
  target: string;
  links: ExportLinkStyle;
  attachments: boolean;
}

interface PlannedEntry {
  /** The path inside the archive: the vault-relative path. */
  name: string;
  abs: string;
  size: number;
  mtimeMs: number;
  /** A Markdown note whose copy is rewritten (links=relative). */
  rewrite: boolean;
}

export interface ExportPlan {
  request: ExportRequest;
  entries: PlannedEntry[];
  /** The bytes of the files themselves, before the archive's own headers. */
  totalBytes: number;
  /** The download's file name, human, may carry Arabic. */
  filename: string;
}

const SCOPES: readonly ExportScope[] = ["note", "folder", "tag", "vault"];

/** Read and validate the query. Every failure is a 400 with a stable code,
 *  so the dialog can say it in the reader's language. */
export function parseExportQuery(q: Record<string, string | undefined>): ExportRequest {
  const scope = q.scope as ExportScope | undefined;
  if (!scope || !SCOPES.includes(scope)) {
    throw new VaultError(400, "scope must be note, folder, tag or vault", "exportBadScope");
  }
  const raw = (q.target ?? "").trim();
  let target = "";
  switch (scope) {
    case "note":
      if (!raw) throw new VaultError(400, "Missing query param: target", "exportBadTarget");
      target = assertNotePath(raw);
      safeAbs(target); // traversal → 400, ignored paths → 404
      break;
    case "folder":
      target = normalizeRel(raw);
      if (target !== "") safeAbs(target);
      break;
    case "tag":
      target = raw.replace(/^#/, "").trim().toLowerCase();
      if (!target) throw new VaultError(400, "Missing query param: target", "exportBadTarget");
      break;
    case "vault":
      break;
  }
  const links = q.links ?? "wiki";
  if (links !== "wiki" && links !== "relative") {
    throw new VaultError(400, "links must be wiki or relative", "exportBadLinks");
  }
  const attachments = q.attachments === undefined ? true : q.attachments !== "0" && q.attachments !== "false";
  return { scope, target, links, attachments };
}

/** A file name for the download: what was exported, and when. The scope's
 *  own name is kept as written — Arabic included — and the route encodes it
 *  RFC 5987-style with an ASCII fallback beside it. */
function filenameFor(req: ExportRequest): string {
  const day = new Date().toISOString().slice(0, 10);
  let stem: string;
  switch (req.scope) {
    case "note":
      stem = noteTitleOf(req.target);
      break;
    case "folder":
      stem = req.target === "" ? "vault" : req.target.slice(req.target.lastIndexOf("/") + 1);
      break;
    case "tag":
      stem = req.target.replace(/\//g, "-");
      break;
    case "vault":
      stem = "vault";
      break;
  }
  const clean = stem.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim() || "export";
  return `${clean} ${day}.zip`;
}

/** Everything the stream needs, decided up front — including the refusal. */
export async function planExport(request: ExportRequest): Promise<ExportPlan> {
  const selection = exportSelection(request.scope, request.target, request.attachments);
  const names = [...selection.notes, ...selection.attachments];
  const entries: PlannedEntry[] = [];
  let totalBytes = 0;
  for (const name of names) {
    let abs: string;
    try {
      abs = safeAbs(name);
    } catch {
      continue; // an index entry the filesystem no longer agrees with
    }
    // lstat, and a file only: the same rule /api/file keeps. The index skips
    // links already; this is the second lock on the same door.
    let stat;
    try {
      stat = await fs.lstat(abs);
    } catch {
      continue; // vanished between the index and now — not ours to invent
    }
    if (!stat.isFile()) continue;
    entries.push({
      name,
      abs,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      // Rewriting reads the whole note into memory; a note the index only
      // ever read the head of (over 2 MB) streams as it is instead.
      rewrite: request.links === "relative" && isNotePath(name) && !isTexPath(name) && name.endsWith(".md") && stat.size <= 2 * 1024 * 1024,
    });
    totalBytes += stat.size;
  }
  if (entries.length === 0) throw new VaultError(404, "Nothing to export", "exportEmpty");
  // The central directory counts entries in sixteen bits (no ZIP64 here).
  if (entries.length > 0xffff) {
    throw new VaultError(413, `Export holds ${entries.length} files; an archive can hold 65,535. Export a folder or a tag at a time.`, "exportTooLarge");
  }
  if (totalBytes > EXPORT_MAX_BYTES) {
    throw new VaultError(
      413,
      `Export is ${(totalBytes / 1024 ** 3).toFixed(2)} GB; the archive cap is ${EXPORT_MAX_BYTES / 1024 ** 3} GB. Export a folder or a tag at a time.`,
      "exportTooLarge",
    );
  }
  return { request, entries, totalBytes, filename: filenameFor(request) };
}

/** The dry run's answer: the plan's counts, nothing streamed. */
export function summarize(plan: ExportPlan): ExportSummary {
  let notes = 0;
  for (const entry of plan.entries) if (isNotePath(entry.name)) notes++;
  return { notes, attachments: plan.entries.length - notes, bytes: plan.totalBytes, filename: plan.filename };
}

/** The resolver the rewrite uses: a wikilink target becomes a relative link
 *  only when the file it names is IN THE ARCHIVE. A link to a note the
 *  export left out stays a wikilink — see shared/exportLinks.ts for why. */
function resolverFor(plan: ExportPlan): LinkResolver {
  const inArchive = new Set(plan.entries.map((e) => e.name));
  const memo = new Map<string, string | null>();
  return (target) => {
    const hit = memo.get(target);
    if (hit !== undefined) return hit;
    const resolved = resolveEmbed(target, false, null);
    const answer = resolved !== null && inArchive.has(resolved) ? resolved : null;
    memo.set(target, answer);
    return answer;
  };
}

/** The archive, as an async sequence of chunks. */
async function* archiveChunks(plan: ExportPlan): AsyncGenerator<Uint8Array> {
  const queue: Uint8Array[] = [];
  const writer = new ZipWriter((chunk) => queue.push(chunk));
  const resolve = plan.request.links === "relative" ? resolverFor(plan) : null;
  for (const entry of plan.entries) {
    if (entry.rewrite && resolve) {
      const text = await fs.readFile(entry.abs, "utf8");
      const bytes = new TextEncoder().encode(rewriteWikilinks(text, entry.name, resolve));
      writer.begin(entry.name, entry.mtimeMs, bytes.length);
      writer.write(bytes);
    } else {
      writer.begin(entry.name, entry.mtimeMs, entry.size);
      const stream = createReadStream(entry.abs, { highWaterMark: 1 << 20 });
      for await (const chunk of stream) {
        writer.write(chunk as Buffer);
        while (queue.length > 0) yield queue.shift() as Uint8Array;
      }
    }
    writer.end();
    while (queue.length > 0) yield queue.shift() as Uint8Array;
  }
  writer.finish();
  while (queue.length > 0) yield queue.shift() as Uint8Array;
}

/** The response body: a web stream over the generator above, which is the
 *  shape Hono hands to the socket without buffering. */
export function exportStream(plan: ExportPlan): ReadableStream {
  return Readable.toWeb(Readable.from(archiveChunks(plan))) as unknown as ReadableStream;
}

/** `Content-Disposition` for the download: an ASCII name every client
 *  accepts, and the real one (Arabic included) in the RFC 5987 field the
 *  browsers actually read. */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "").replace(/\s+/g, " ").trim();
  // An Arabic stem strips to its date alone; "export 2026-09-14.zip" is a
  // name, "2026-09-14.zip" is a puzzle.
  const named = /^[\d\s.-]*\.zip$/.test(ascii) || !ascii.endsWith(".zip") ? `export ${ascii.replace(/\.zip$/, "")}.zip`.replace(/\s+/g, " ") : ascii;
  return `attachment; filename="${named}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
