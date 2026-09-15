// A TYPED ANSWER, compared. `kind: typed` puts an input on the star's front
// and the reader types what they think the back says; this is the
// comparison, and the diff the card colours. Forgiving on purpose about
// what a keyboard cannot help — case, surrounding space, Unicode form and
// kana width (NFKC folds half-width katakana to full) — and strict about
// nothing else, because the GRADE stays the reader's: the diff is a
// reading aid, not a verdict.

export function normaliseAnswer(s: string): string {
  return s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export type DiffOp = { kind: "same" | "add" | "drop"; text: string };

/** Character diff of `typed` against `expected`, both normalised: "same"
 *  runs the reader got, "drop" what they typed that is not there, "add"
 *  what they missed. Longest-common-subsequence over characters; the
 *  answers are a few words, so the quadratic table is nothing. */
export function diffAnswer(typed: string, expected: string): { ok: boolean; ops: DiffOp[] } {
  const a = [...normaliseAnswer(typed)];
  const b = [...normaliseAnswer(expected)];
  if (a.join("") === b.join("")) return { ok: true, ops: [{ kind: "same", text: b.join("") }] };
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  const push = (kind: DiffOp["kind"], ch: string): void => {
    const last = ops[ops.length - 1];
    if (last && last.kind === kind) last.text += ch;
    else ops.push({ kind, text: ch });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push("drop", a[i]);
      i++;
    } else {
      push("add", b[j]);
      j++;
    }
  }
  while (i < n) push("drop", a[i++]);
  while (j < m) push("add", b[j++]);
  return { ok: false, ops };
}
