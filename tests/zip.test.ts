// The ZIP writer (shared/zip.ts): the format's fixed fields, the CRC, the
// data descriptor, the UTF-8 flag, and the streaming contract.
//
// The reader below is deliberately tiny and deliberately independent of the
// writer: it walks the central directory the way `unzip` does (end record →
// directory → local headers), so an archive that satisfies it is one the
// real tools open. A test that asserted the writer against its own
// constants would prove only that the constants were typed twice.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crc32, dosDateTime, ZipWriter, zipSync } from "../shared/zip.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

interface Entry {
  name: string;
  crc: number;
  size: number;
  flags: number;
  method: number;
  offset: number;
  data: Uint8Array;
}

/** A minimal central-directory reader: enough to prove the archive is
 *  well-formed and to hand back each entry's bytes. */
function readZip(bytes: Uint8Array): Entry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end record is the last 22 bytes when there is no comment.
  const endAt = bytes.length - 22;
  assert.equal(view.getUint32(endAt, true), 0x06054b50, "end-of-central-directory signature");
  const count = view.getUint16(endAt + 10, true);
  const dirSize = view.getUint32(endAt + 12, true);
  const dirAt = view.getUint32(endAt + 16, true);
  assert.equal(dirAt + dirSize, endAt, "the directory runs up to the end record");
  const entries: Entry[] = [];
  let at = dirAt;
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(at, true), 0x02014b50, "central header signature");
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const csize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    assert.equal(csize, size, "STORE: compressed size equals size");
    // Now the local header the offset points at.
    assert.equal(view.getUint32(offset, true), 0x04034b50, "local header signature");
    const localNameLen = view.getUint16(offset + 26, true);
    const localExtraLen = view.getUint16(offset + 28, true);
    assert.equal(dec.decode(bytes.subarray(offset + 30, offset + 30 + localNameLen)), name);
    const dataAt = offset + 30 + localNameLen + localExtraLen;
    const data = bytes.subarray(dataAt, dataAt + size);
    // With bit 3 set, the local header's numbers are zero and the descriptor
    // after the data carries the truth.
    if (flags & (1 << 3)) {
      assert.equal(view.getUint32(offset + 14, true), 0, "local crc deferred");
      assert.equal(view.getUint32(offset + 18, true), 0, "local size deferred");
      const descAt = dataAt + size;
      assert.equal(view.getUint32(descAt, true), 0x08074b50, "data descriptor signature");
      assert.equal(view.getUint32(descAt + 4, true), crc, "descriptor crc equals central crc");
      assert.equal(view.getUint32(descAt + 8, true), size);
      assert.equal(view.getUint32(descAt + 12, true), size);
    }
    entries.push({ name, crc, size, flags, method, offset, data });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

describe("crc32", () => {
  it("matches the published check value", () => {
    // The CRC-32 of "123456789" is the constant every implementation is
    // checked against.
    assert.equal(crc32(enc.encode("123456789")), 0xcbf43926);
    assert.equal(crc32(new Uint8Array(0)), 0);
  });

  it("is the same whether fed whole or in pieces", () => {
    const whole = enc.encode("The quick brown fox jumps over the lazy dog");
    const a = crc32(whole);
    let running = 0;
    for (let i = 0; i < whole.length; i += 7) running = crc32(whole.subarray(i, i + 7), running);
    assert.equal(running, a);
  });
});

describe("dosDateTime", () => {
  it("keeps a modern mtime to the (even) second", () => {
    const { time, date } = dosDateTime(new Date(2026, 8, 13, 14, 30, 45).getTime());
    assert.equal(date >> 9, 2026 - 1980);
    assert.equal((date >> 5) & 0xf, 9);
    assert.equal(date & 0x1f, 13);
    assert.equal(time >> 11, 14);
    assert.equal((time >> 5) & 0x3f, 30);
    assert.equal((time & 0x1f) * 2, 44);
  });

  it("dates a file older than the format to 1980-01-01", () => {
    assert.deepEqual(dosDateTime(0), { time: 0, date: (1 << 5) | 1 });
    assert.deepEqual(dosDateTime(Number.NaN), { time: 0, date: (1 << 5) | 1 });
  });
});

describe("ZipWriter", () => {
  it("writes an archive a directory walk reads back byte for byte", () => {
    const files = [
      { name: "Ideas.md", data: enc.encode("# Ideas\n\n[[Other]]\n") },
      { name: "Media/pixel.png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]) },
      { name: "empty.md", data: new Uint8Array(0) },
    ];
    const entries = readZip(zipSync(files));
    assert.deepEqual(
      entries.map((e) => e.name),
      files.map((f) => f.name),
    );
    for (let i = 0; i < files.length; i++) {
      assert.deepEqual(entries[i].data, files[i].data, files[i].name);
      assert.equal(entries[i].crc, crc32(files[i].data));
      assert.equal(entries[i].size, files[i].data.length);
      assert.equal(entries[i].method, 0, "STORE");
    }
  });

  it("marks every name UTF-8 so an Arabic path survives", () => {
    const name = "ملاحظات/فكرة جديدة.md";
    const [entry] = readZip(zipSync([{ name, data: enc.encode("مرحبا") }]));
    assert.equal(entry.name, name);
    assert.ok(entry.flags & (1 << 11), "general-purpose bit 11 set");
    assert.equal(dec.decode(entry.data), "مرحبا");
  });

  it("streams: chunks of any size, the descriptor written after the data", () => {
    const chunks: Uint8Array[] = [];
    const writer = new ZipWriter((c) => chunks.push(c));
    const big = new Uint8Array(100_000);
    for (let i = 0; i < big.length; i++) big[i] = (i * 31) & 0xff;
    writer.begin("big.bin", Date.now());
    for (let i = 0; i < big.length; i += 4096) writer.write(big.subarray(i, i + 4096));
    writer.end();
    writer.file("small.md", enc.encode("x"));
    writer.finish();
    const bytes = new Uint8Array(writer.written);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.length;
    }
    assert.equal(at, bytes.length, "`written` is the byte count handed to the sink");
    const [a, b] = readZip(bytes);
    assert.equal(a.name, "big.bin");
    assert.deepEqual(a.data, big);
    assert.equal(a.crc, crc32(big));
    assert.ok(a.flags & (1 << 3), "data descriptor flag set");
    assert.equal(b.name, "small.md");
  });

  it("refuses misuse loudly rather than writing a broken archive", () => {
    const writer = new ZipWriter(() => undefined);
    assert.throws(() => writer.write(new Uint8Array(1)), /no entry is open/);
    assert.throws(() => writer.end(), /no entry is open/);
    writer.begin("a");
    assert.throws(() => writer.begin("b"), /still open/);
    assert.throws(() => writer.finish(), /still open/);
    writer.end();
    writer.finish();
    assert.throws(() => writer.begin("c"), /already finished/);
    assert.throws(() => writer.finish(), /already finished/);
  });

  it("an empty archive is the 22-byte end record", () => {
    const bytes = zipSync([]);
    assert.equal(bytes.length, 22);
    assert.deepEqual(readZip(bytes), []);
  });
});
