// What the three converters hand the planner (docs/import.md), and the
// unpacking every one of them starts with.
//
// A converter reads ONE export — a Notion zip, an Evernote .enex, an Obsidian
// vault — and answers in export terms: each note's path inside the export,
// the folder it wants under the import's target, its words as Markdown with
// links still spelled the way the export spelled them, and its properties.
// Everything that is about THIS vault — which names are free, where the
// attachments folder is, which links to rewrite into what — is the planner's
// (server/import/plan.ts), so the three converters stay small and alike.

import { extensionOf } from "../../shared/attachments.ts";
import type { FrontValue } from "../../shared/importPlan.ts";
import { listZip, readZipEntry, ZipError } from "../zip.ts";
import { VaultError } from "../vault.ts";

/** One file of the export, by its path inside it (`/`-separated). */
export interface ExportFile {
  path: string;
  bytes: Uint8Array;
}

export interface SourceNote {
  /** Its path inside the export — what other notes' links name. */
  source: string;
  /** The export folder it sat in, for resolving its relative links. */
  dir: string;
  /** Where it wants to land, relative to the import's folder, `.md`. */
  want: string;
  /** Title, for a note that is given an H1 (Notion, Evernote). */
  title: string | null;
  /** The words, Markdown, links as the export wrote them. */
  body: string;
  /** Properties to write as frontmatter; null keeps the note's own
   *  frontmatter as it is (Obsidian). */
  fields: Array<[string, FrontValue]> | null;
}

export interface SourceAttachment {
  /** Its path inside the export. */
  source: string;
  /** The file name it wants. */
  name: string;
  bytes: Uint8Array;
}

export type SkipReason = "unsupported" | "empty" | "unreadable" | "system";

export interface Converted {
  notes: SourceNote[];
  attachments: SourceAttachment[];
  skipped: Array<{ path: string; reason: SkipReason }>;
  /** Counts the preview reports under "frontmatter". */
  stats: { properties: number; tags: number; created: number; aliases: number; publishCleared: number };
}

export function emptyStats(): Converted["stats"] {
  return { properties: 0, tags: 0, created: 0, aliases: 0, publishCleared: 0 };
}

/** How many files one export may hold, and how many bytes once unpacked: a
 *  zip is small on the wire and can be anything inside (a zip bomb is a
 *  kilobyte that inflates to a disk). */
export const MAX_ENTRIES = 20_000;
export const MAX_UNPACKED = 1024 * 1024 * 1024;

const decoder = new TextDecoder("utf-8");
export function text(bytes: Uint8Array): string {
  return decoder.decode(bytes).replace(/^﻿/, "");
}

/** Every file of a zip, directories dropped, a zip inside the zip opened
 *  once (Notion's large exports are a zip of `Part-1.zip`, `Part-2.zip`…). */
export function unzipExport(bytes: Uint8Array): ExportFile[] {
  const out: ExportFile[] = [];
  let total = 0;
  const walk = (archive: Uint8Array, depth: number): void => {
    let entries;
    try {
      entries = listZip(archive);
    } catch (err) {
      if (err instanceof ZipError) throw new VaultError(400, err.message, "importNotZip");
      throw err;
    }
    for (const entry of entries) {
      if (entry.name.endsWith("/")) continue;
      if (out.length >= MAX_ENTRIES) throw new VaultError(413, `The export holds more than ${MAX_ENTRIES} files`, "importTooMany");
      total += entry.size;
      if (total > MAX_UNPACKED) throw new VaultError(413, "The export unpacks to more than a gigabyte", "importTooBig");
      const data = readZipEntry(archive, entry);
      const name = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
      if (depth === 0 && extensionOf(name) === "zip") walk(data, 1);
      else out.push({ path: name, bytes: data });
    }
  };
  walk(bytes, 0);
  return dropCommonRoot(out);
}

/** An export zipped from its folder has every path under one top folder
 *  ("Export-8f3…/", "My Vault/"); that folder is the export, not a folder in
 *  it, and is dropped. */
export function dropCommonRoot(files: ExportFile[]): ExportFile[] {
  if (files.length === 0) return files;
  const first = files[0].path.split("/")[0];
  if (!files.every((f) => f.path.includes("/") && f.path.split("/")[0] === first)) return files;
  return files.map((f) => ({ ...f, path: f.path.slice(first.length + 1) }));
}

export function dirOf(p: string): string {
  const cut = p.lastIndexOf("/");
  return cut === -1 ? "" : p.slice(0, cut);
}

export function baseOf(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}

/** Files every OS drops into a folder, which are nobody's notes. */
export function isSystemFile(p: string): boolean {
  const base = baseOf(p);
  return base === ".DS_Store" || base === "Thumbs.db" || base === "desktop.ini" || p.startsWith("__MACOSX/") || base.startsWith("._");
}
