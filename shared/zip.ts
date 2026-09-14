// A ZIP writer, and nothing more than the export needs.
//
// The archive an export produces is the one file that leaves the vault whole,
// and the reader's next tool for it is `unzip`, the Finder, Obsidian's
// importer or a phone — every one of which reads the format below. It is
// written by hand rather than pulled in as a dependency for the reason the
// rest of shared/ is pure: this module loads under `node --test`, carries no
// DOM and no node built-in, and is small enough to be read whole.
//
// Three decisions, each with a reason:
//
//   STORE, never DEFLATE. The bytes go in as they are on disk. Markdown would
//   compress well, but a vault's bulk is its pictures, and those are already
//   compressed; the price of an inflater is a dependency or a node built-in,
//   and the price of STORE is a few percent on the text. The archive's job
//   is fidelity, not size.
//
//   A DATA DESCRIPTOR after every entry (general-purpose bit 3). The local
//   header would otherwise need the CRC and the size BEFORE the data, which
//   means either reading every file twice or holding it whole in memory —
//   and a 1.5 GB screen recording is a legitimate attachment. With the
//   descriptor the writer takes chunks as they come, computes the CRC as it
//   goes, and writes the truth after the data; the central directory, which
//   every reader trusts first, carries the same numbers again.
//
//   BIT 11 (UTF-8 names) on every entry. Without it a reader is entitled to
//   read the name as CP437, and «ملاحظة.md» becomes a row of question marks
//   in every archive tool on Windows. Half of the vaults this serves are
//   Arabic; a name that does not survive the trip is a lost note.
//
// No ZIP64. The export refuses anything above 2 GB (shared/limits.ts) long
// before the 4 GB fields here would overflow, and a cap that is stated is
// better than a format extension nobody tests.

// ──────────────────────────────────────────────────────────────────── CRC-32

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** Continue a CRC-32 over `bytes`. Start from 0 and feed chunks in order —
 *  the running value is the state, so an entry can be summed as it streams.
 *  The result is the standard (IEEE 802.3) CRC every ZIP reader checks. */
export function crc32(bytes: Uint8Array, seed = 0): number {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ─────────────────────────────────────────────────────────────── the writer

const SIG_LOCAL = 0x04034b50;
const SIG_DESCRIPTOR = 0x08074b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
/** "version needed to extract" 2.0: the data descriptor asks for it. */
const VERSION_NEEDED = 20;
/** "version made by": 2.0, host system 3 (UNIX) so the external attributes
 *  below are read as a mode and an extracted note is `-rw-r--r--`. */
const VERSION_MADE_BY = (3 << 8) | 20;
const FLAG_DESCRIPTOR = 1 << 3;
const FLAG_UTF8 = 1 << 11;
const METHOD_STORE = 0;
/** `-rw-r--r--` in the high word, where a UNIX host keeps it. */
const EXTERNAL_ATTRS = (0o100644 << 16) >>> 0;

const encoder = new TextEncoder();

/** The DOS date/time pair a ZIP entry carries, from an epoch-ms mtime. The
 *  format has no room for anything before 1980 and two-second resolution,
 *  so a note's mtime survives to the second, floored, and a file older than
 *  the format is dated to its first day rather than wrapped. */
export function dosDateTime(mtimeMs: number): { time: number; date: number } {
  const d = new Date(mtimeMs);
  if (!Number.isFinite(mtimeMs) || d.getFullYear() < 1980) return { time: 0, date: (1 << 5) | 1 };
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

interface Record {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

/** A little-endian byte builder for the fixed headers. */
class Header {
  private readonly view: DataView;
  readonly bytes: Uint8Array;
  private at = 0;
  constructor(size: number) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }
  u16(v: number): this {
    this.view.setUint16(this.at, v & 0xffff, true);
    this.at += 2;
    return this;
  }
  u32(v: number): this {
    this.view.setUint32(this.at, v >>> 0, true);
    this.at += 4;
    return this;
  }
}

/** Writes one archive to `sink`, chunk by chunk, in order. Open an entry,
 *  push its bytes in any number of pieces, close it; `finish()` writes the
 *  central directory and the end record, after which the writer is spent.
 *
 *  The writer never buffers: every call hands the sink exactly the bytes the
 *  format needs at that point, so the caller's memory is its own chunk size
 *  and the archive can be as large as the cap allows. */
export class ZipWriter {
  private readonly records: Record[] = [];
  private offset = 0;
  private open: Record | null = null;
  private finished = false;
  private readonly sink: (chunk: Uint8Array) => void;

  constructor(sink: (chunk: Uint8Array) => void) {
    this.sink = sink;
  }

  /** Bytes handed to the sink so far — the archive's size when finished. */
  get written(): number {
    return this.offset;
  }

  private emit(chunk: Uint8Array): void {
    this.sink(chunk);
    this.offset += chunk.length;
  }

  /** Open an entry. `name` is the path inside the archive, POSIX separators,
   *  no leading slash — a vault-relative path is already the right shape. */
  begin(name: string, mtimeMs: number = Date.now()): void {
    if (this.finished) throw new Error("zip: archive already finished");
    if (this.open) throw new Error("zip: an entry is still open");
    const nameBytes = encoder.encode(name);
    const { time, date } = dosDateTime(mtimeMs);
    const record: Record = { name: nameBytes, crc: 0, size: 0, offset: this.offset, time, date };
    const header = new Header(30)
      .u32(SIG_LOCAL)
      .u16(VERSION_NEEDED)
      .u16(FLAG_DESCRIPTOR | FLAG_UTF8)
      .u16(METHOD_STORE)
      .u16(time)
      .u16(date)
      .u32(0) // crc — in the descriptor
      .u32(0) // compressed size — in the descriptor
      .u32(0) // uncompressed size — in the descriptor
      .u16(nameBytes.length)
      .u16(0); // no extra field
    this.emit(header.bytes);
    this.emit(nameBytes);
    this.open = record;
  }

  /** Part of the open entry's data. Any size, any number of times. */
  write(chunk: Uint8Array): void {
    const record = this.open;
    if (!record) throw new Error("zip: no entry is open");
    if (chunk.length === 0) return;
    record.crc = crc32(chunk, record.crc);
    record.size += chunk.length;
    this.emit(chunk);
  }

  /** Close the open entry: the descriptor with the numbers now known. */
  end(): void {
    const record = this.open;
    if (!record) throw new Error("zip: no entry is open");
    const descriptor = new Header(16).u32(SIG_DESCRIPTOR).u32(record.crc).u32(record.size).u32(record.size);
    this.emit(descriptor.bytes);
    this.records.push(record);
    this.open = null;
  }

  /** A whole entry from bytes already in hand. */
  file(name: string, data: Uint8Array, mtimeMs?: number): void {
    this.begin(name, mtimeMs);
    this.write(data);
    this.end();
  }

  /** The central directory and the end-of-central-directory record. */
  finish(): void {
    if (this.finished) throw new Error("zip: archive already finished");
    if (this.open) throw new Error("zip: an entry is still open");
    const start = this.offset;
    for (const record of this.records) {
      const header = new Header(46)
        .u32(SIG_CENTRAL)
        .u16(VERSION_MADE_BY)
        .u16(VERSION_NEEDED)
        .u16(FLAG_DESCRIPTOR | FLAG_UTF8)
        .u16(METHOD_STORE)
        .u16(record.time)
        .u16(record.date)
        .u32(record.crc)
        .u32(record.size)
        .u32(record.size)
        .u16(record.name.length)
        .u16(0) // extra
        .u16(0) // comment
        .u16(0) // disk number start
        .u16(0) // internal attributes
        .u32(EXTERNAL_ATTRS)
        .u32(record.offset);
      this.emit(header.bytes);
      this.emit(record.name);
    }
    const size = this.offset - start;
    const end = new Header(22)
      .u32(SIG_END)
      .u16(0)
      .u16(0)
      .u16(this.records.length)
      .u16(this.records.length)
      .u32(size)
      .u32(start)
      .u16(0);
    this.emit(end.bytes);
    this.finished = true;
  }
}

/** One archive, in memory, from a list — the shape a test or a small caller
 *  wants. Everything else should stream through `ZipWriter`. */
export function zipSync(entries: { name: string; data: Uint8Array; mtimeMs?: number }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const writer = new ZipWriter((chunk) => chunks.push(chunk));
  for (const entry of entries) writer.file(entry.name, entry.data, entry.mtimeMs);
  writer.finish();
  const out = new Uint8Array(writer.written);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
