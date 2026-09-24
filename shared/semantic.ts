// ASK THE VAULT — the pure half (docs/ask.md).
//
// Everything here is arithmetic on strings and arrays, shared by the server
// (server/embeddings.ts, server/ask.ts) and the client (the answer panel's
// citation chips, "Copy as note"), and pinned by tests/semantic.test.ts:
//
//   chunkNote        a note → passages of ~200–400 tokens, cut at headings
//                    and paragraphs, each carrying its heading, its line and
//                    its UTF-8 byte span in the file
//   embedInput       what the embedding model is actually shown for a chunk
//   normalize / dot  cosine similarity on unit vectors
//   rankTop          the k best of a scored stream, without sorting it all
//   buildAskPrompt   the grounding: numbered excerpts and the rules
//   splitCitations   an answer's `[n]` markers → text and citation segments
//   answerMarkdown   an answer with its citations as wikilinks, as a note
//
// No model, no network, no filesystem in this file — the parts that are
// allowed to fail are elsewhere.

import { closesFence, fenceOpener, type Fence } from "./fences.ts";
import { stripMarkdown } from "./prose.ts";
import { splitFrontmatter } from "./noteParse.ts";
import { foldTerm } from "./fold.ts";
import { headingOf } from "./headings.ts";

// ── Chunking ──────────────────────────────────────────────────────────────

/** Where a chunk stops growing. Estimated tokens, not characters: an
 *  embedding model's window is counted in tokens, and Arabic spends about
 *  half again as many per character as English. */
export const CHUNK_TARGET_TOKENS = 300;
/** No chunk is longer than this; a paragraph that is, is cut at sentences. */
export const CHUNK_MAX_TOKENS = 400;
/** A chunk shorter than this is merged into the previous one UNDER THE SAME
 *  HEADING — a one-line paragraph on its own is a weak vector. It is never
 *  merged across a heading: the heading is what a citation opens at. */
export const CHUNK_MIN_TOKENS = 40;
/** A pathological note (a pasted log) must not cost the index thousands of
 *  vectors. Past this the rest of the note is simply not embedded. */
export const MAX_CHUNKS_PER_NOTE = 200;

export interface NoteChunk {
  /** 0-based position of the chunk in its note. */
  index: number;
  /** The heading the chunk sits under — the text a `[[Note#Heading]]` names.
   *  null above the first heading, and under a heading that only repeats the
   *  note's own title (an H1 at the top): a citation then opens the note. */
  heading: string | null;
  /** 1-based line of that heading in the whole file (frontmatter included),
   *  or of the chunk's first line when it has no heading: where to land. */
  headingLine: number;
  /** 1-based first and last line of the chunk itself. */
  line: number;
  endLine: number;
  /** UTF-8 byte span of the chunk in the file, end exclusive. */
  start: number;
  end: number;
  /** The chunk as prose: markdown stripped, whitespace collapsed. */
  text: string;
}

const ARABIC_RE = /[\u{600}-\u{6FF}\u{750}-\u{77F}\u{8A0}-\u{8FF}\u{FB50}-\u{FDFF}\u{FE70}-\u{FEFF}]/gu;

/** A rough token count: ~4 characters a token for Latin script, ~2.5 for
 *  Arabic. It only has to be right to within a few tens of percent — it
 *  decides where a chunk is cut, not whether a model accepts it. */
export function estimateTokens(text: string): number {
  const arabic = text.match(ARABIC_RE)?.length ?? 0;
  return Math.ceil((text.length - arabic) / 4 + arabic / 2.5);
}

/** UTF-8 length of a string without allocating a buffer for it. */
export function utf8Length(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}


/** A run of source text: [from, to) in UTF-16 offsets of the whole file. */
interface Span {
  from: number;
  to: number;
}

interface Section {
  heading: string | null;
  headingOffset: number | null;
  paragraphs: Span[];
}

/** The text of a heading line as a link would name it: inline marks off. */
function headingText(raw: string): string {
  return stripMarkdown(raw).replace(/\s*—$/, "").trim();
}

/** Split the note body into sections (by ATX heading, outside fences) and
 *  each section into paragraphs (blank-line separated; a fenced block is one
 *  paragraph, whatever blank lines it holds). Offsets are into `source`. */
function sectionsOf(source: string, bodyOffset: number): Section[] {
  const sections: Section[] = [{ heading: null, headingOffset: null, paragraphs: [] }];
  let para: Span | null = null;
  let fence: Fence | null = null;
  let offset = bodyOffset;
  const extend = (from: number, to: number): void => {
    if (para) para.to = to;
    else para = { from, to };
  };
  const close = (): void => {
    if (para) sections[sections.length - 1].paragraphs.push(para);
    para = null;
  };
  for (const raw of source.slice(bodyOffset).split("\n")) {
    const lineFrom = offset;
    const lineTo = offset + raw.length; // without the "\n"
    offset = lineTo + 1;
    const line = raw.replace(/\r$/, "");
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      extend(lineFrom, lineTo);
      continue;
    }
    const opened = fenceOpener(line);
    if (opened) {
      fence = opened;
      extend(lineFrom, lineTo);
      continue;
    }
    const h = headingOf(line);
    if (h && h.raw.trim() !== "") {
      close();
      sections.push({ heading: headingText(h.raw.replace(/[ \t]*#*[ \t]*$/, "")), headingOffset: lineFrom, paragraphs: [] });
      continue;
    }
    if (line.trim() === "") {
      close();
      continue;
    }
    extend(lineFrom, lineTo);
  }
  close();
  return sections;
}

/** Cut one oversized span at sentence ends (., !, ?, ؟, ۔ and line breaks),
 *  packing sentences back up to the target. A single sentence longer than the
 *  maximum is cut at a space, as a last resort. */
function splitLong(source: string, span: Span): Span[] {
  const text = source.slice(span.from, span.to);
  const bounds: number[] = [];
  const re = /[.!?؟۔](?=\s)|\n/g;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) bounds.push(m.index + m[0].length);
  bounds.push(text.length);
  const out: Span[] = [];
  let from = 0;
  let last = 0;
  for (const b of bounds) {
    if (estimateTokens(text.slice(from, b)) > CHUNK_TARGET_TOKENS && last > from) {
      out.push({ from: span.from + from, to: span.from + last });
      from = last;
    }
    last = b;
  }
  if (from < text.length) out.push({ from: span.from + from, to: span.to });
  // A sentence that is itself over the maximum: cut at whitespace.
  const final: Span[] = [];
  for (const s of out) {
    let piece = s;
    while (estimateTokens(source.slice(piece.from, piece.to)) > CHUNK_MAX_TOKENS) {
      const slice = source.slice(piece.from, piece.to);
      let cut = Math.floor(slice.length * (CHUNK_TARGET_TOKENS / estimateTokens(slice)));
      const space = slice.lastIndexOf(" ", cut);
      if (space > cut / 2) cut = space;
      if (cut <= 0) break;
      final.push({ from: piece.from, to: piece.from + cut });
      piece = { from: piece.from + cut, to: piece.to };
    }
    final.push(piece);
  }
  return final;
}

/** A note → its chunks. `title` is the note's name, so an H1 that merely
 *  repeats it is not treated as a heading worth citing. */
export function chunkNote(source: string, title: string): NoteChunk[] {
  const { body } = splitFrontmatter(source);
  const bodyOffset = source.length - body.length;
  const titleKey = foldTerm(title.toLowerCase());
  const drafts: { heading: string | null; headingOffset: number | null; span: Span }[] = [];
  for (const section of sectionsOf(source, bodyOffset)) {
    const titled = section.heading !== null && section.heading !== "" && foldTerm(section.heading.toLowerCase()) !== titleKey ? section.heading : null;
    let current: Span | null = null;
    const flush = (): void => {
      if (current) drafts.push({ heading: titled, headingOffset: section.headingOffset, span: current });
      current = null;
    };
    for (const p of section.paragraphs) {
      const pieces = estimateTokens(source.slice(p.from, p.to)) > CHUNK_MAX_TOKENS ? splitLong(source, p) : [p];
      for (const piece of pieces) {
        if (current === null) {
          current = { ...piece };
          continue;
        }
        const joined = estimateTokens(source.slice(current.from, piece.to));
        if (joined > CHUNK_TARGET_TOKENS && estimateTokens(source.slice(current.from, current.to)) >= CHUNK_MIN_TOKENS) {
          flush();
          current = { ...piece };
        } else if (joined > CHUNK_MAX_TOKENS) {
          flush();
          current = { ...piece };
        } else {
          current.to = piece.to;
        }
      }
    }
    flush();
  }

  // Offsets → lines and bytes, walking forward once (chunks are in order).
  const out: NoteChunk[] = [];
  let charAt = 0;
  let byteAt = 0;
  let lineAt = 1;
  const advance = (to: number): void => {
    const seg = source.slice(charAt, to);
    byteAt += utf8Length(seg);
    for (let i = 0; i < seg.length; i++) if (seg.charCodeAt(i) === 10) lineAt++;
    charAt = to;
  };
  // Heading offsets come before their chunk, so they are resolved on the way.
  for (const d of drafts) {
    const text = stripMarkdown(source.slice(d.span.from, d.span.to)).replace(/\s+/g, " ").trim();
    if (text === "") continue;
    let headingLine = 0;
    if (d.headingOffset !== null && d.headingOffset >= charAt) {
      advance(d.headingOffset);
      headingLine = lineAt;
    } else if (d.headingOffset !== null) {
      headingLine = lineOfOffset(source, d.headingOffset);
    }
    advance(d.span.from);
    const line = lineAt;
    const start = byteAt;
    advance(d.span.to);
    out.push({
      index: out.length,
      heading: d.heading,
      headingLine: d.heading !== null && headingLine > 0 ? headingLine : line,
      line,
      endLine: lineAt,
      start,
      end: byteAt,
      text,
    });
    if (out.length >= MAX_CHUNKS_PER_NOTE) break;
  }
  return out;
}

function lineOfOffset(source: string, offset: number): number {
  let n = 1;
  for (let i = 0; i < offset && i < source.length; i++) if (source.charCodeAt(i) === 10) n++;
  return n;
}

/** What the embedding model is shown for one chunk: the note's name and the
 *  heading above the prose, so "Pruning" under "Olive trees" is embedded as
 *  being about olive trees. The CONTENT HASH is taken over exactly this, so a
 *  renamed note or a renamed heading is (correctly) a new vector. */
export function embedInput(title: string, chunk: Pick<NoteChunk, "heading" | "text">): string {
  return `${chunk.heading ? `${title} › ${chunk.heading}` : title}\n\n${chunk.text}`;
}

/** Some embedding models were trained with an instruction in front of the
 *  text, one for a query and one for a passage, and are measurably worse
 *  without it. The families that need one, by the name Ollama pulls them
 *  under; every other model is shown the text bare. */
export function embedPrefixes(model: string): { query: string; document: string } {
  const name = model.toLowerCase().replace(/:.*$/, "");
  if (name.startsWith("nomic-embed-text")) return { query: "search_query: ", document: "search_document: " };
  if (name.startsWith("embeddinggemma")) return { query: "task: search result | query: ", document: "title: none | text: " };
  if (name.startsWith("mxbai-embed-large") || name.startsWith("snowflake-arctic-embed")) {
    return { query: "Represent this sentence for searching relevant passages: ", document: "" };
  }
  return { query: "", document: "" };
}

// ── Vectors ───────────────────────────────────────────────────────────────

/** Scale to unit length, in place, and hand the same array back. After this,
 *  cosine similarity is a dot product. A zero vector stays zero. */
export function normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const len = Math.sqrt(sum);
  if (len > 0) for (let i = 0; i < v.length; i++) v[i] /= len;
  return v;
}

/** Dot product; for unit vectors, the cosine. Mismatched lengths (two models'
 *  vectors meeting by mistake) compare as unrelated rather than throwing. */
export function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** The mean of unit vectors, re-normalized: a note's vector from its chunks'. */
export function centroid(vectors: readonly Float32Array[]): Float32Array | null {
  if (vectors.length === 0) return null;
  const out = new Float32Array(vectors[0].length);
  for (const v of vectors) {
    if (v.length !== out.length) continue;
    for (let i = 0; i < v.length; i++) out[i] += v[i];
  }
  return normalize(out);
}

/** The k highest-scoring items, best first. Ties keep arrival order, so a
 *  ranking is stable across runs over the same index. */
export function rankTop<T>(items: Iterable<T>, k: number, score: (item: T) => number): { item: T; score: number }[] {
  if (k <= 0) return [];
  const top: { item: T; score: number; seq: number }[] = [];
  let seq = 0;
  for (const item of items) {
    const s = score(item);
    if (!Number.isFinite(s)) continue;
    if (top.length === k && s <= top[top.length - 1].score) {
      seq++;
      continue;
    }
    const entry = { item, score: s, seq: seq++ };
    let i = top.length;
    while (i > 0 && (top[i - 1].score < s || (top[i - 1].score === s && top[i - 1].seq > entry.seq))) i--;
    top.splice(i, 0, entry);
    if (top.length > k) top.pop();
  }
  return top.map(({ item, score }) => ({ item, score }));
}

// ── Asking ────────────────────────────────────────────────────────────────

/** One retrieved passage as the answer panel, the prompt and the note see it. */
export interface AskSource {
  /** 1-based: the number the model cites it by. */
  n: number;
  path: string;
  title: string;
  heading: string | null;
  /** Where "open" lands: the heading's line, else the chunk's. */
  line: number;
  text: string;
  score: number;
}

/** The instructions, in English whatever the question's language: the models
 *  follow English instructions best, and rule 4 makes the answer follow the
 *  question. The one sentence for "nothing" is given in both languages so the
 *  honest answer is recognizable and the same every time. */
export const ASK_SYSTEM = [
  "You answer questions about the owner's personal notes, using ONLY the numbered excerpts you are given.",
  "Rules:",
  "1. Use nothing but the excerpts. Do not add facts from your own knowledge, even true ones.",
  "2. After every sentence that uses an excerpt, cite it by number in square brackets, like [2] or [1][3].",
  '3. If the excerpts do not answer the question, reply with one sentence: "The vault says nothing about <the subject>." (in Arabic: «لا تقول الخزانة شيئًا عن <الموضوع>.») and nothing else.',
  "4. If the question assumes something the excerpts do not support, say so plainly instead of going along with it.",
  "5. Answer in the language of the question. Be brief: a few short paragraphs at most. No preamble, no closing summary.",
].join("\n");

/** The user turn: the excerpts, numbered, then the question. */
export function buildAskPrompt(question: string, sources: readonly AskSource[]): string {
  const blocks = sources.map((s) => `[${s.n}] ${s.heading ? `${s.title} › ${s.heading}` : s.title}\n${s.text}`);
  return `Excerpts from the notes:\n\n${blocks.join("\n\n")}\n\nQuestion: ${question.trim()}`;
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_INDIC = "۰۱۲۳۴۵۶۷۸۹";
function westernDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const a = ARABIC_INDIC.indexOf(d);
    return String(a >= 0 ? a : PERSIAN_INDIC.indexOf(d));
  });
}

export type AnswerSegment = { kind: "text"; text: string } | { kind: "cite"; n: number };

/** `[1]`, `[1, 3]`, `[1][2]`, `[١]` — the shapes a model writes a citation in.
 *  Digits in any of the three numeral sets, separated by commas (Latin or
 *  Arabic) or spaces. */
const CITE_RE = /\[\s*([0-9٠-٩۰-۹]{1,3}(?:\s*[,،]?\s*[0-9٠-٩۰-۹]{1,3})*)\s*\]/g;

/** Split an answer into prose and citations. A number with no source behind
 *  it (the model invented `[9]` for six excerpts) is DROPPED, never shown as a
 *  link to nothing; `invalid` names what was dropped so the panel can say so. */
export function splitCitations(answer: string, sourceCount: number): { segments: AnswerSegment[]; invalid: number[] } {
  const segments: AnswerSegment[] = [];
  const invalid: number[] = [];
  let last = 0;
  const push = (text: string): void => {
    if (text === "") return;
    const prev = segments[segments.length - 1];
    if (prev?.kind === "text") prev.text += text;
    else segments.push({ kind: "text", text });
  };
  for (const m of answer.matchAll(CITE_RE)) {
    const at = m.index ?? 0;
    push(answer.slice(last, at));
    last = at + m[0].length;
    for (const part of westernDigits(m[1]).split(/[\s,،]+/)) {
      if (part === "") continue;
      const n = Number(part);
      if (Number.isInteger(n) && n >= 1 && n <= sourceCount) segments.push({ kind: "cite", n });
      else invalid.push(n);
    }
  }
  push(answer.slice(last));
  return { segments, invalid };
}

/** The wikilink a citation becomes: `[[Note#Heading]]`, or `[[Note]]` for a
 *  chunk with no heading of its own. `spelling` is how the vault names the
 *  note in a link (the server's linkSpellingFor; the basename by default). */
export function citationLink(source: Pick<AskSource, "title" | "heading">, spelling = source.title, alias?: string): string {
  const heading = source.heading ? `#${source.heading.replace(/[[\]|#]/g, " ").trim()}` : "";
  return `[[${spelling}${heading}${alias ? `|${alias}` : ""}]]`;
}

export interface AnswerNote {
  question: string;
  answer: string;
  sources: readonly (AskSource & { spelling?: string })[];
  model: string;
  /** false when the answer came from a model off this machine. */
  local: boolean;
  /** YYYY-MM-DD, the asker's day. */
  date: string;
}

/** Quote a YAML scalar only when it needs it. */
function yamlScalar(value: string): string {
  return /^[\w .:/-]+$/.test(value) && !/^\s|\s$/.test(value) ? value : JSON.stringify(value);
}

/** The note "Copy as note" writes: `source: ask` in the frontmatter, the
 *  question as its title, the answer with every `[n]` turned into a wikilink
 *  to the passage it cites, and the sources listed under it — the ones the
 *  answer actually cited, in the order it first cited them. */
export function answerMarkdown(note: AnswerNote): string {
  const { segments } = splitCitations(note.answer, note.sources.length);
  const cited: number[] = [];
  let body = "";
  for (const seg of segments) {
    if (seg.kind === "text") body += seg.text;
    else {
      const s = note.sources[seg.n - 1];
      if (!cited.includes(seg.n)) cited.push(seg.n);
      body += citationLink(s, s.spelling ?? s.title, String(cited.indexOf(seg.n) + 1));
    }
  }
  const lines = [
    "---",
    "source: ask",
    `asked: ${note.date}`,
    `model: ${yamlScalar(note.model)}`,
    `local: ${note.local ? "true" : "false"}`,
    "---",
    `# ${note.question.trim().replace(/\s+/g, " ")}`,
    "",
    body.trim(),
    "",
  ];
  if (cited.length > 0) {
    lines.push("## Sources", "");
    cited.forEach((n, i) => {
      const s = note.sources[n - 1];
      lines.push(`${i + 1}. ${citationLink(s, s.spelling ?? s.title)}`);
    });
    lines.push("");
  }
  return lines.join("\n");
}

/** A question → a file name: the characters a vault path or a wikilink
 *  cannot carry are dropped, whitespace collapses, and it is cut at a word
 *  near 80 characters. */
export function questionFileName(question: string): string {
  let name = question
    .replace(/[\\/:*?"<>|#^[\]؟]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  if (name.length > 80) {
    const cut = name.lastIndexOf(" ", 80);
    name = name.slice(0, cut > 40 ? cut : 80).trim();
  }
  return name === "" ? "Question" : name;
}
