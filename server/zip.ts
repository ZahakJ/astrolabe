// A ZIP READER, and nothing more than the .apkg importer needs.
//
// shared/zip.ts writes archives and deliberately reads none: the export's
// job is to leave the vault whole and it never has to open what it wrote.
// The Anki importer has the opposite job — a deck arrives as a ZIP made by
// somebody else's tool — and this is the ~100 lines that open it, kept on
// the server because the inflater is a node built-in (node:zlib) and the
// shared/ modules carry none.
//
// It walks the archive the way `unzip` does: the end-of-central-directory
// record is found from the tail, the central directory names every entry
// with its sizes and its method, and the local header is consulted only to
// find where the entry's bytes start. Sizes come from the CENTRAL directory
// on purpose — a writer that used a data descriptor (shared/zip.ts is one)
// leaves zeros in the local header, and the directory is what every reader
// trusts first anyway.
//
// STORE and DEFLATE are the two methods Anki and every general tool use;
// anything else is refused by name. No ZIP64: a deck that needs 4 GB fields
// is not a deck this importer is for, and the refusal says so rather than
// reading garbage offsets.

import { inflateRawSync } from "node:zlib";

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
/** The end record is 22 bytes plus a comment of at most 65535. */
const END_SEARCH_MAX = 22 + 0xffff;
/** Bit 11: the name is UTF-8. Without it the name is CP437, and the
 *  archives this reader meets (Anki's, our own) all set it; a name that is
 *  plain ASCII reads the same either way. */
const FLAG_UTF8 = 1 << 11;

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  crc: number;
  /** Offset of the entry's local header from the start of the archive. */
  offset: number;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

const utf8 = new TextDecoder("utf-8");
const cp437 = new TextDecoder("latin1");

/** Every entry the archive's central directory names, in directory order. */
export function listZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endAt = findEndRecord(bytes, view);
  const count = view.getUint16(endAt + 10, true);
  const dirSize = view.getUint32(endAt + 12, true);
  const dirAt = view.getUint32(endAt + 16, true);
  if (dirAt === 0xffffffff || view.getUint16(endAt + 4, true) !== 0) {
    throw new ZipError("zip: ZIP64 and multi-disk archives are not supported");
  }
  if (dirAt + dirSize > bytes.length) throw new ZipError("zip: the central directory runs past the end of the file");
  const entries: ZipEntry[] = [];
  let at = dirAt;
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== SIG_CENTRAL) {
      throw new ZipError("zip: a central directory entry is missing its signature");
    }
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    if (compressedSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) {
      throw new ZipError("zip: ZIP64 entries are not supported");
    }
    const nameBytes = bytes.subarray(at + 46, at + 46 + nameLen);
    const name = (flags & FLAG_UTF8 ? utf8 : cp437).decode(nameBytes);
    entries.push({ name, method, compressedSize, size, crc, offset });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** The end-of-central-directory record's offset: the LAST signature in the
 *  tail, searched backwards so an archive comment that happens to contain
 *  the four bytes cannot fool the walk. */
function findEndRecord(bytes: Uint8Array, view: DataView): number {
  const floor = Math.max(0, bytes.length - END_SEARCH_MAX);
  for (let at = bytes.length - 22; at >= floor; at--) {
    if (view.getUint32(at, true) === SIG_END) return at;
  }
  throw new ZipError("zip: not a ZIP archive (no end-of-central-directory record)");
}

/** One entry's bytes, inflated when the entry was deflated. The local
 *  header is read only for the lengths of its name and extra field — the
 *  data begins right after them. */
export function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = entry.offset;
  if (at + 30 > bytes.length || view.getUint32(at, true) !== SIG_LOCAL) {
    throw new ZipError(`zip: "${entry.name}" has no local header where the directory says`);
  }
  const nameLen = view.getUint16(at + 26, true);
  const extraLen = view.getUint16(at + 28, true);
  const start = at + 30 + nameLen + extraLen;
  const end = start + entry.compressedSize;
  if (end > bytes.length) throw new ZipError(`zip: "${entry.name}" runs past the end of the file`);
  const raw = bytes.subarray(start, end);
  if (entry.method === METHOD_STORE) return raw;
  if (entry.method === METHOD_DEFLATE) {
    const out = inflateRawSync(raw);
    if (out.length !== entry.size) throw new ZipError(`zip: "${entry.name}" inflated to the wrong size`);
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  }
  throw new ZipError(`zip: "${entry.name}" uses compression method ${entry.method}, which is not supported`);
}

/** The archive as a name → entry map, for a caller that asks by name. A
 *  name that appears twice keeps its LAST entry, which is what every
 *  extractor does with an archive that was appended to. */
export function zipIndex(bytes: Uint8Array): Map<string, ZipEntry> {
  const map = new Map<string, ZipEntry>();
  for (const entry of listZip(bytes)) map.set(entry.name, entry);
  return map;
}

// ── The same archive, read a slice at a time ────────────────────────────────
//
// Everything above takes the WHOLE archive as bytes, which is right for an
// Anki deck: it arrives as an upload, it is already in memory, and the
// importer reads every row of it once. A book is the opposite case on both
// counts. An EPUB sits in the vault and is opened again and again — one
// chapter here, one illustration there, forty times in a sitting — and an
// illustrated volume is tens of megabytes. Reading all of it to answer "give
// me chapter twelve" is the shape of code that makes a reader wait a second
// per tap on a phone, and it holds the whole book in the server's heap while
// it does.
//
// So this half reads through a FILE HANDLE at offsets: the tail once (the end
// record and the central directory), then exactly one entry's compressed bytes
// per request. Opening a 40 MB book costs ~100 kB of reads; a chapter costs
// the chapter. NOTHING IS UNPACKED ANYWHERE — there is no temporary directory
// in this module and there must never be one, because a book in a folder the
// owner has not published must not leave a copy of itself outside the vault.

import type { FileHandle } from "node:fs/promises";

/** Read at most `length` bytes at `position`. */
async function readAt(handle: FileHandle, position: number, length: number): Promise<Uint8Array> {
  const buf = Buffer.alloc(Math.max(0, length));
  if (buf.length === 0) return buf;
  const { bytesRead } = await handle.read(buf, 0, buf.length, position);
  return buf.subarray(0, bytesRead);
}

/** An open archive: its directory, and a way to pull one entry out of it.
 *  Holds no bytes of the archive beyond the directory itself. */
export interface ZipFile {
  /** name → entry, last wins, exactly as `zipIndex`. */
  entries: Map<string, ZipEntry>;
  /** One entry's bytes, inflated. Two positional reads: the local header,
   *  then the data. */
  read(entry: ZipEntry): Promise<Uint8Array>;
}

/**
 * Read an archive's central directory through a file handle.
 *
 * The tail is read in one go — 22 bytes of end record plus at most 64 KiB of
 * archive comment — and the directory is then read at the offset that record
 * names. The refusals are `listZip`'s, in the same words: ZIP64 and multi-disk
 * archives are not read rather than read wrongly.
 */
export async function readZipDirectory(handle: FileHandle, size: number): Promise<ZipFile> {
  const tailLen = Math.min(size, END_SEARCH_MAX);
  const tail = await readAt(handle, size - tailLen, tailLen);
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let endAt = -1;
  for (let at = tail.length - 22; at >= 0; at--) {
    if (tailView.getUint32(at, true) === SIG_END) {
      endAt = at;
      break;
    }
  }
  if (endAt === -1) throw new ZipError("zip: not a ZIP archive (no end-of-central-directory record)");
  const count = tailView.getUint16(endAt + 10, true);
  const dirSize = tailView.getUint32(endAt + 12, true);
  const dirAt = tailView.getUint32(endAt + 16, true);
  if (dirAt === 0xffffffff || tailView.getUint16(endAt + 4, true) !== 0) {
    throw new ZipError("zip: ZIP64 and multi-disk archives are not supported");
  }
  if (dirAt + dirSize > size) throw new ZipError("zip: the central directory runs past the end of the file");

  const dir = await readAt(handle, dirAt, dirSize);
  const view = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const entries = new Map<string, ZipEntry>();
  let at = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > dir.length || view.getUint32(at, true) !== SIG_CENTRAL) {
      throw new ZipError("zip: a central directory entry is missing its signature");
    }
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressedSize = view.getUint32(at + 20, true);
    const entrySize = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    if (compressedSize === 0xffffffff || entrySize === 0xffffffff || offset === 0xffffffff) {
      throw new ZipError("zip: ZIP64 entries are not supported");
    }
    const nameBytes = dir.subarray(at + 46, at + 46 + nameLen);
    const name = (flags & FLAG_UTF8 ? utf8 : cp437).decode(nameBytes);
    entries.set(name, { name, method, compressedSize, size: entrySize, crc, offset });
    at += 46 + nameLen + extraLen + commentLen;
  }

  return { entries, read: (entry) => readZipEntryAt(handle, entry, size) };
}

/** One entry's bytes through a handle: the local header, then the data, then
 *  the inflate. Exported on its own because a caller that has CACHED the
 *  directory (server/epub.ts does — a book is opened again and again) needs
 *  the read without paying for the walk a second time. */
export async function readZipEntryAt(handle: FileHandle, entry: ZipEntry, fileSize: number): Promise<Uint8Array> {
  const header = await readAt(handle, entry.offset, 30);
  if (header.length < 30) throw new ZipError(`zip: "${entry.name}" has no local header where the directory says`);
  const hv = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (hv.getUint32(0, true) !== SIG_LOCAL) {
    throw new ZipError(`zip: "${entry.name}" has no local header where the directory says`);
  }
  const start = entry.offset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
  if (start + entry.compressedSize > fileSize) throw new ZipError(`zip: "${entry.name}" runs past the end of the file`);
  const raw = await readAt(handle, start, entry.compressedSize);
  if (entry.method === METHOD_STORE) return raw;
  if (entry.method === METHOD_DEFLATE) {
    const out = inflateRawSync(raw);
    if (out.length !== entry.size) throw new ZipError(`zip: "${entry.name}" inflated to the wrong size`);
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  }
  throw new ZipError(`zip: "${entry.name}" uses compression method ${entry.method}, which is not supported`);
}
