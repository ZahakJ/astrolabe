// ONE `Range:` PARSER — for the server's /api/file and the pocket's.
//
// pdf.js and the media elements ask for byte ranges as a reader seeks. The two
// servers parsed the header separately and once disagreed about a range past
// the end: the server answered 200 with the whole file, the pocket 416. A
// reader's PDF behaved differently on the phone than on the desk over the same
// bytes. Now both ask this, and both answer RFC 9110's way.

/** What a request's `Range` header asks of a file of `size` bytes:
 *  - `null` — no byte range asked for (absent, or another unit): serve it all;
 *  - `"unsatisfiable"` — a byte range that cannot be served (malformed, a
 *    multi-range, past the end, a zero suffix, an empty file): 416 with
 *    `Content-Range: bytes *\/size`;
 *  - `{ start, end }` — inclusive offsets: 206 with that slice. */
export function parseByteRange(
  header: string | null | undefined,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const value = header.trim();
  if (!/^bytes=/i.test(value)) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(value);
  if (!m || (m[1] === "" && m[2] === "") || size <= 0) return "unsatisfiable";
  let start: number;
  let end: number;
  if (m[1] === "") {
    // A suffix: the last N bytes.
    const suffix = Number(m[2]);
    if (!(suffix > 0)) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!(start >= 0 && start <= end && start < size)) return "unsatisfiable";
  return { start, end };
}
