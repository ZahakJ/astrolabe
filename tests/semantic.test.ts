import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHUNK_MAX_TOKENS,
  answerMarkdown,
  buildAskPrompt,
  centroid,
  chunkNote,
  citationLink,
  dot,
  embedInput,
  embedPrefixes,
  estimateTokens,
  normalize,
  questionFileName,
  rankTop,
  splitCitations,
  utf8Length,
  type AskSource,
} from "../shared/semantic.ts";

const bytes = (s: string): Buffer => Buffer.from(s, "utf8");

describe("chunkNote", () => {
  const note = [
    "---",
    "tags: [sleep]",
    "---",
    "# Naps",
    "",
    "A nap of fifteen minutes restores alertness.",
    "",
    "## The coffee nap",
    "",
    "Drink an espresso and lie down at once.",
    "",
    "## القهوة قبل القيلولة",
    "",
    "من الحيل المعروفة أن يشرب المرء فنجان قهوة ثم يستلقي فورًا.",
    "",
  ].join("\n");

  it("cuts at headings, names each chunk's heading, and leaves out the title's own H1", () => {
    const chunks = chunkNote(note, "Naps");
    assert.deepEqual(
      chunks.map((c) => c.heading),
      [null, "The coffee nap", "القهوة قبل القيلولة"],
    );
    assert.deepEqual(chunks.map((c) => c.text), [
      "A nap of fifteen minutes restores alertness.",
      "Drink an espresso and lie down at once.",
      "من الحيل المعروفة أن يشرب المرء فنجان قهوة ثم يستلقي فورًا.",
    ]);
  });

  it("carries 1-based lines in the WHOLE file, frontmatter included, and lands on the heading", () => {
    const [intro, coffee, arabic] = chunkNote(note, "Naps");
    assert.equal(intro.line, 6);
    assert.equal(intro.headingLine, 6); // no heading of its own: the passage
    assert.equal(coffee.headingLine, 8);
    assert.equal(coffee.line, 10);
    assert.equal(arabic.headingLine, 12);
    assert.equal(arabic.line, 14);
  });

  it("carries UTF-8 byte offsets that slice the file back to the passage, Arabic included", () => {
    const file = bytes(note);
    for (const c of chunkNote(note, "Naps")) {
      const raw = file.subarray(c.start, c.end).toString("utf8");
      assert.equal(raw, c.text);
    }
  });

  it("keeps a fenced block whole, blank lines and all, and never reads a # inside it as a heading", () => {
    const md = "# T\n\n## Setup\n\n```sh\n# not a heading\n\necho hi\n```\n\nAfter the fence.\n";
    const chunks = chunkNote(md, "T");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].heading, "Setup");
  });

  it("never lets a chunk grow past the maximum, cutting a long paragraph at sentences", () => {
    const sentence = "The slow waves of deep sleep are not idle time for the brain at all. ";
    const md = `# Long\n\n${sentence.repeat(120)}\n`;
    const chunks = chunkNote(md, "Long");
    assert.ok(chunks.length > 1);
    for (const c of chunks) assert.ok(estimateTokens(c.text) <= CHUNK_MAX_TOKENS, `${estimateTokens(c.text)} tokens`);
    const file = bytes(md);
    for (const c of chunks) assert.ok(file.subarray(c.start, c.end).toString("utf8").trim().length > 0);
  });

  it("merges short paragraphs under one heading, but never across a heading", () => {
    const md = "# N\n\n## A\n\nOne.\n\nTwo.\n\n## B\n\nThree.\n";
    const chunks = chunkNote(md, "N");
    assert.deepEqual(chunks.map((c) => [c.heading, c.text]), [
      ["A", "One. Two."],
      ["B", "Three."],
    ]);
  });

  it("reads a CRLF note like an LF one", () => {
    const crlf = chunkNote(note.replace(/\n/g, "\r\n"), "Naps");
    assert.deepEqual(crlf.map((c) => c.heading), [null, "The coffee nap", "القهوة قبل القيلولة"]);
    assert.equal(crlf[1].line, 10);
  });

  it("an empty note has no chunks", () => {
    assert.deepEqual(chunkNote("", "Empty"), []);
    assert.deepEqual(chunkNote("---\na: 1\n---\n# Empty\n", "Empty"), []);
  });
});

describe("the embedding input", () => {
  it("puts the note and the heading above the passage", () => {
    assert.equal(embedInput("Olive trees", { heading: "Pruning", text: "Prune in late winter." }), "Olive trees › Pruning\n\nPrune in late winter.");
    assert.equal(embedInput("Naps", { heading: null, text: "A nap." }), "Naps\n\nA nap.");
  });

  it("gives the instruction-trained families their prefixes and every other model none", () => {
    assert.equal(embedPrefixes("nomic-embed-text:latest").query, "search_query: ");
    assert.equal(embedPrefixes("embeddinggemma").document, "title: none | text: ");
    assert.deepEqual(embedPrefixes("bge-m3"), { query: "", document: "" });
  });

  it("counts UTF-8 like Buffer does", () => {
    for (const s of ["abc", "résumé", "القيلولة", "𝄞 clef", ""]) assert.equal(utf8Length(s), bytes(s).length);
  });
});

describe("cosine ranking", () => {
  const v = (...xs: number[]): Float32Array => normalize(Float32Array.from(xs));

  it("normalizes to unit length, so the dot product is the cosine", () => {
    const a = v(3, 4);
    assert.ok(Math.abs(dot(a, a) - 1) < 1e-6);
    assert.ok(Math.abs(dot(v(1, 0), v(0, 1))) < 1e-6);
    assert.equal(dot(v(1, 0), v(1, 0, 0)), 0); // two models' vectors never compare
  });

  it("ranks the k best, best first, ties in arrival order", () => {
    const q = v(1, 0);
    const items = [
      { id: "far", vec: v(0, 1) },
      { id: "near", vec: v(1, 0.1) },
      { id: "same-a", vec: v(1, 0.5) },
      { id: "same-b", vec: v(1, 0.5) },
      { id: "exact", vec: v(1, 0) },
    ];
    const top = rankTop(items, 3, (x) => dot(q, x.vec));
    assert.deepEqual(top.map((t) => t.item.id), ["exact", "near", "same-a"]);
    assert.deepEqual(rankTop(items, 0, () => 1), []);
  });

  it("a note's vector is the re-normalized mean of its chunks'", () => {
    const c = centroid([v(1, 0), v(0, 1)])!;
    assert.ok(Math.abs(c[0] - Math.SQRT1_2) < 1e-6 && Math.abs(c[1] - Math.SQRT1_2) < 1e-6);
    assert.equal(centroid([]), null);
  });
});

describe("citations", () => {
  const sources: (AskSource & { spelling?: string })[] = [
    { n: 1, path: "Sleep/Naps.md", title: "Naps", heading: "The coffee nap", line: 8, text: "…", score: 0.8 },
    { n: 2, path: "Sleep/Caffeine.md", title: "Caffeine", heading: null, line: 5, text: "…", score: 0.7 },
    { n: 3, path: "Garden/Olive.md", title: "Olive", heading: "Pruning [late] #1", line: 9, text: "…", score: 0.6, spelling: "Garden/Olive" },
  ];

  it("splits an answer into prose and citations, in every shape a model writes one", () => {
    const { segments, invalid } = splitCitations("A [1]. B [2, 3]. C [1][3]. D [١]. E [9].", 3);
    assert.deepEqual(segments, [
      { kind: "text", text: "A " },
      { kind: "cite", n: 1 },
      { kind: "text", text: ". B " },
      { kind: "cite", n: 2 },
      { kind: "cite", n: 3 },
      { kind: "text", text: ". C " },
      { kind: "cite", n: 1 },
      { kind: "cite", n: 3 },
      { kind: "text", text: ". D " },
      { kind: "cite", n: 1 },
      { kind: "text", text: ". E " },
      { kind: "text", text: "." },
    ].reduce<typeof segments>((acc, s) => {
      const prev = acc[acc.length - 1];
      if (s.kind === "text" && prev?.kind === "text") prev.text += s.text;
      else acc.push({ ...s } as (typeof segments)[number]);
      return acc;
    }, []));
    assert.deepEqual(invalid, [9]); // a source that was never given is dropped, and named
  });

  it("a citation is a wikilink to the note and its heading, in the vault's spelling", () => {
    assert.equal(citationLink(sources[0]), "[[Naps#The coffee nap]]");
    assert.equal(citationLink(sources[1]), "[[Caffeine]]");
    // [ ] | # would end or reopen the link; they become spaces.
    assert.equal(citationLink(sources[2], "Garden/Olive", "2"), "[[Garden/Olive#Pruning  late   1|2]]");
  });

  it("an answer becomes a note: source: ask, the question as title, links numbered by first citation", () => {
    const md = answerMarkdown({
      question: "  Why does coffee   keep me up? ",
      answer: "Half-life [2]. The nap trick [1][2].",
      sources,
      model: "qwen3.5:9b",
      local: true,
      date: "2026-09-23",
    });
    assert.equal(
      md,
      [
        "---",
        "source: ask",
        "asked: 2026-09-23",
        "model: qwen3.5:9b",
        "local: true",
        "---",
        "# Why does coffee keep me up?",
        "",
        "Half-life [[Caffeine|1]]. The nap trick [[Naps#The coffee nap|2]][[Caffeine|1]].",
        "",
        "## Sources",
        "",
        "1. [[Caffeine]]",
        "2. [[Naps#The coffee nap]]",
        "",
      ].join("\n"),
    );
  });

  it("an honest 'nothing' has no sources section", () => {
    const md = answerMarkdown({ question: "Q?", answer: "The vault says nothing about that.", sources, model: "m", local: false, date: "2026-01-01" });
    assert.ok(!md.includes("## Sources"));
    assert.match(md, /^local: false$/m);
  });

  it("the prompt numbers the passages the answer will cite", () => {
    const p = buildAskPrompt("Why?", sources.slice(0, 2));
    assert.match(p, /\[1\] Naps › The coffee nap\n…/);
    assert.match(p, /\[2\] Caffeine\n…/);
    assert.match(p, /Question: Why\?$/);
  });

  it("a question becomes a file name a vault and a wikilink can carry", () => {
    assert.equal(questionFileName("What is [[this]] #tag / path?"), "What is this tag path");
    assert.equal(questionFileName("لماذا يُقلَّم الزيتون؟"), "لماذا يُقلَّم الزيتون");
    assert.equal(questionFileName("???"), "Question");
    assert.ok(questionFileName("word ".repeat(40)).length <= 80);
  });
});
