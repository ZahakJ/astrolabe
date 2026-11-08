// Published titles in one house style (shared/titleCase.ts).
//
// A note's title is its filename, typed in whatever case the moment
// suggested. Every PUBLIC surface shows it in Chicago Title Case; the file,
// its URL and every admin surface keep the name as written. The first block
// pins the rule on titles taken from the real vault; the second pins where it
// applies: the post list, the feed, the page's <title> and og:title, and a
// visitor's search, but never the admin's search or the permalink.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { HEAD_PLACEHOLDER, injectHead, renderFeed } from "../server/blog.ts";
import { initIndexer, posts, search } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { publicTitleOf, titleCase } from "../shared/titleCase.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

describe("titleCase: titles from the vault", () => {
  const cases: [string, string][] = [
    ["Tracing from first principles", "Tracing from First Principles"],
    ["Hall-effect thrusters", "Hall-Effect Thrusters"],
    ["Sloppy evolution", "Sloppy Evolution"],
    ["Death of the Polymath", "Death of the Polymath"],
    ["perf record", "perf record"],
    ["struct page", "struct page"],
    ["Mechanics of a particle", "Mechanics of a Particle"],
    ["It's all about complexity", "It's All About Complexity"],
    ["Strategic vs. Tactical Programming", "Strategic vs. Tactical Programming"],
    ["IV - Normal Science as Puzzle-solving", "IV - Normal Science as Puzzle-Solving"],
    ["Time — The First Quantum Concept", "Time — The First Quantum Concept"],
    ["ماذا سيبقى لهم", "ماذا سيبقى لهم"],
  ];
  for (const [input, want] of cases) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(want)}`, () => {
      assert.equal(titleCase(input), want);
    });
  }
});

describe("titleCase: the rules", () => {
  it("lowercases minor words in the middle, even when typed capitalised", () => {
    assert.equal(titleCase("Political Context of The Apology"), "Political Context of the Apology");
    assert.equal(titleCase("Principled Disobedience to The Law"), "Principled Disobedience to the Law");
  });

  it("capitalises a minor word that opens or closes the title", () => {
    assert.equal(titleCase("A proposal for the city"), "A Proposal for the City");
    assert.equal(titleCase("What is the Republic about?"), "What Is the Republic About?");
    assert.equal(titleCase("Something to look up"), "Something to Look Up");
  });

  it("opens a new phrase after a dash or a colon", () => {
    assert.equal(titleCase("01 - the most precious thing"), "01 - The Most Precious Thing");
    assert.equal(titleCase("Clocks: a history"), "Clocks: A History");
    assert.equal(titleCase("Chapter 2. the political context"), "Chapter 2. The Political Context");
  });

  it("keeps a minor part of a compound lowercase after its first part", () => {
    assert.equal(titleCase("Staying up-to-date"), "Staying Up-to-Date");
    assert.equal(titleCase("Time-based measurement"), "Time-Based Measurement");
  });

  it("leaves names and codes alone: inner capitals, digits, underscores, dots", () => {
    assert.equal(titleCase("Why do we talk about ML?"), "Why Do We Talk About ML?");
    assert.equal(titleCase("Spivak C1 theorem 1"), "Spivak C1 Theorem 1");
    assert.equal(titleCase("Using IEEE 1588 in practice"), "Using IEEE 1588 in Practice");
    assert.equal(titleCase("Notes on v2 and pdf_tex"), "Notes on v2 and pdf_tex");
    assert.equal(titleCase("Sorting e.g. by date"), "Sorting e.g. by Date");
  });

  it("looks through quotes and brackets around a word", () => {
    assert.equal(titleCase('3 - "Reason" in philosophy'), '3 - "Reason" in Philosophy');
    assert.equal(titleCase("The Demon-Haunted World (chapter)"), "The Demon-Haunted World (Chapter)");
  });

  it("leaves a title that starts lowercase, or holds non-Latin letters, untouched", () => {
    assert.equal(titleCase("ftrace"), "ftrace");
    assert.equal(titleCase("struct folio and its pages"), "struct folio and its pages");
    assert.equal(titleCase("1 - ما هو الاستبداد"), "1 - ما هو الاستبداد");
    assert.equal(titleCase("Notes on λ calculus"), "Notes on λ calculus");
  });

  it("is idempotent", () => {
    for (const t of ["Tracing from first principles", "IV - Normal Science as Puzzle-solving", "What is Justice?"]) {
      assert.equal(titleCase(titleCase(t)), titleCase(t));
    }
  });

  it("uses a frontmatter title exactly as written", () => {
    assert.equal(publicTitleOf("some file", "my own lowercase title"), "my own lowercase title");
    assert.equal(publicTitleOf("Sloppy evolution", "  Sloppy evolution  "), "Sloppy evolution");
    assert.equal(publicTitleOf("Sloppy evolution", undefined), "Sloppy Evolution");
    assert.equal(publicTitleOf("Sloppy evolution", ""), "Sloppy Evolution");
  });
});

describe("titleCase: where it applies", () => {
  const ORIGIN = "https://astrolabe.example";
  const OFF = { mode: "off", lang: null, fallbackFrom: null } as const;
  const data = makeDir();
  const root = makeVault({
    "Sloppy evolution.md": note({ publish: "true", date: "2026-05-04" }, "Evolution is sloppy and the fossil record shows it.\n"),
    "perf record.md": note({ publish: "true", date: "2026-05-03" }, "Sampling the call stack with perf.\n"),
    "Named by hand.md": note({ publish: "true", date: "2026-05-02", title: "named by hand, on purpose" }, "A post with its own title.\n"),
  });

  before(async () => {
    initSite({ ASTROLABE_DATA: data });
    initVault(root);
    await initIndexer();
  });

  after(() => {
    removeVault(root);
    removeVault(data);
  });

  it("the post list carries the public title and the unchanged path", () => {
    const byPath = new Map(posts(true, null).map((p) => [p.path, p.title]));
    assert.equal(byPath.get("Sloppy evolution.md"), "Sloppy Evolution");
    assert.equal(byPath.get("perf record.md"), "perf record");
    assert.equal(byPath.get("Named by hand.md"), "named by hand, on purpose");
  });

  it("the feed, <title> and og:title carry it; the permalink does not change", () => {
    const feed = renderFeed(ORIGIN, OFF);
    assert.ok(feed.includes("<title>Sloppy Evolution</title>"));
    assert.ok(feed.includes(`${ORIGIN}/Sloppy%20evolution`));
    const html = injectHead(`<html><head><title>x</title>${HEAD_PLACEHOLDER}</head><body></body></html>`, ORIGIN, "/Sloppy%20evolution");
    assert.match(html, /<title>Sloppy Evolution — /);
    assert.match(html, /<meta property="og:title" content="Sloppy Evolution — /);
  });

  it("a visitor's search shows the public title; the admin's shows the file's", () => {
    const visitor = search("fossil", true, null).find((h) => h.path === "Sloppy evolution.md");
    const admin = search("fossil", false, null).find((h) => h.path === "Sloppy evolution.md");
    assert.equal(visitor?.title, "Sloppy Evolution");
    assert.equal(admin?.title, "Sloppy evolution");
  });
});
