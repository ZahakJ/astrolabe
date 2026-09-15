import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EVERYTHING_ELSE,
  deckNotePath,
  deckOf,
  parseDeckFence,
  parseSteps,
  restoreCardSchedule,
  scanDeckCards,
  serialiseDeck,
  writeCardSchedule,
} from "../shared/decks.ts";
import { clearSchedule, scanCards, writeSchedule } from "../shared/flashcards.ts";
import { formatSrComments, parseSrComment, parseSrComments } from "../shared/srs.ts";

// ------------------------------------------------------------------ fixtures

/** A kana deck: typed, its own steps, tags, a section, an extra segment. */
const KANA = `---
title: Hiragana
---

\`\`\`deck
icon: あ
kind: typed
new per day: 5
steps: 1m, 10m, 1h
tags: japanese, #kana
\`\`\`

## Row a

あ::a
い::i::as in "eat"
う::u <!--SR:!2026-09-20,6,2500-->

## Row k

か::ka #kana #k-row
き::ki
`;

/** Reversed pairs, a plain one and a scheduled one, plus a kind: both note. */
const PAIRS = `\`\`\`deck
title: Capitals
\`\`\`

Egypt:::Cairo
Iran:::Tehran <!--SR:!2026-09-20,6,2500!2026-09-25,3,2350-->
Iraq:::Baghdad::since 762
`;

/** Sections, highlights, a block card and a quote in one note. */
const MIXED = `# Astronomy

\`\`\`deck
kind: basic
\`\`\`

## Stars

The nearest star is ==Proxima Centauri==.

What is a light year?
?
The distance light travels in a year.

## Quotes

> [!quote] Sagan
> We are made of star stuff.

Betelgeuse::a red supergiant
`;

/** A note from before decks: two-segment cards, one SR comment. */
const LEGACY = `# Cards

Capital of Egypt::Cairo <!--SR:!2026-09-27,4,2500-->

What is the rule of three?
?
Never keep fewer than three copies.
<!--SR:!2026-09-20,6,2500-->
`;

// ------------------------------------------------------------- the comment

describe("the plugin's multi-schedule comment", () => {
  it("reads one, reads two, writes two, and the first is still the first", () => {
    const two = "<!--SR:!2026-09-20,6,2500!2026-09-25,3,2350-->";
    assert.deepEqual(parseSrComment(two), { due: "2026-09-20", interval: 6, ease: 2500 });
    assert.deepEqual(parseSrComments(two), [
      { due: "2026-09-20", interval: 6, ease: 2500 },
      { due: "2026-09-25", interval: 3, ease: 2350 },
    ]);
    assert.equal(formatSrComments(parseSrComments(two)), two);
    assert.deepEqual(parseSrComments("<!--SR:!2026-09-20,6,2500-->"), [{ due: "2026-09-20", interval: 6, ease: 2500 }]);
    assert.deepEqual(parseSrComments("no comment"), []);
  });
});

// ---------------------------------------------------------------- the fence

describe("the deck fence", () => {
  it("reads every key with its spaces folded, and defaults the rest", () => {
    const head = parseDeckFence(KANA)!;
    assert.deepEqual(head, { title: null, icon: "あ", kind: "typed", newPerDay: 5, steps: [1, 10, 60], tags: ["japanese", "kana"] });
    const bare = parseDeckFence("```deck\n```\n")!;
    assert.deepEqual(bare, { title: null, icon: null, kind: "basic", newPerDay: 10, steps: [1, 10], tags: [] });
    assert.equal(parseDeckFence("```deck\nkind: nonsense\nnewPerDay: -3\nsteps: soon\n```")!.kind, "basic");
    assert.equal(parseDeckFence("```deck\nnew-per-day: 0\nkind: Cloze only\n```")!.newPerDay, 0);
    assert.equal(parseDeckFence("```deck\nkind: cloze only\n```")!.kind, "cloze-only");
  });
  it("is null without a fence, and a fence shown inside a code block is documentation", () => {
    assert.equal(parseDeckFence(LEGACY), null);
    assert.equal(parseDeckFence("````markdown\n```deck\nicon: x\n```\n````\n"), null);
    assert.equal(parseDeckFence("---\ntitle: x\n---\n```deck\nicon: y\n```")!.icon, "y");
  });
  it("parses steps in minutes, hours and days", () => {
    assert.deepEqual(parseSteps("1m, 10m"), [1, 10]);
    assert.deepEqual(parseSteps("5 30 2h 1d"), [5, 30, 120, 1440]);
    assert.deepEqual(parseSteps("0m, x"), []);
  });
});

// -------------------------------------------------------------------- cards

describe("cards, extended", () => {
  it("reads the extra segment, trailing tags and the section", () => {
    const cards = scanCards(KANA);
    assert.deepEqual(cards.map((c) => [c.front, c.back, c.extra, c.section, c.tags]), [
      ["あ", "a", null, "Row a", []],
      ["い", "i", 'as in "eat"', "Row a", []],
      ["う", "u", null, "Row a", []],
      ["か", "ka", null, "Row k", ["kana", "k-row"]],
      ["き", "ki", null, "Row k", []],
    ]);
    assert.equal(cards[2].schedule?.interval, 6);
    assert.equal(cards.every((c) => !c.reversed), true);
  });
  it("reads a ::: pair with two schedules, and an extra after the pair", () => {
    const cards = scanCards(PAIRS);
    assert.equal(cards.length, 3);
    assert.deepEqual(cards.map((c) => [c.front, c.back, c.reversed, c.extra]), [
      ["Egypt", "Cairo", true, null],
      ["Iran", "Tehran", true, null],
      ["Iraq", "Baghdad", true, "since 762"],
    ]);
    assert.equal(cards[0].schedule, null);
    assert.equal(cards[0].scheduleRev, null);
    assert.deepEqual(cards[1].schedule, { due: "2026-09-20", interval: 6, ease: 2500 });
    assert.deepEqual(cards[1].scheduleRev, { due: "2026-09-25", interval: 3, ease: 2350 });
  });
  it("keeps the legacy shapes exactly as before", () => {
    const cards = scanCards(LEGACY);
    assert.deepEqual(cards.map((c) => [c.kind, c.line, c.end, c.front, c.back, c.extra, c.reversed, c.tags, c.section]), [
      ["qa", 3, 3, "Capital of Egypt", "Cairo", null, false, [], "Cards"],
      ["qa", 5, 7, "What is the rule of three?", "Never keep fewer than three copies.", null, false, [], "Cards"],
    ]);
    assert.equal(cards[0].schedule?.interval, 4);
    assert.equal(cards[1].schedule?.interval, 6);
  });
  it("round-trips a legacy note byte for byte when the schedule is unchanged", () => {
    const same = writeSchedule(LEGACY, 3, { due: "2026-09-27", interval: 4, ease: 2500 });
    assert.equal(same, LEGACY);
    const sameBlock = writeSchedule(LEGACY, 5, { due: "2026-09-20", interval: 6, ease: 2500 });
    assert.equal(sameBlock, LEGACY);
  });
});

// -------------------------------------------------------------------- stars

describe("stars of a note", () => {
  it("names each star by path, line and direction, and applies the kind", () => {
    const stars = scanDeckCards(KANA, "Orbits/Hiragana.md", "typed");
    assert.deepEqual(stars.map((s) => s.id), [
      "Orbits/Hiragana.md#15#fwd",
      "Orbits/Hiragana.md#16#fwd",
      "Orbits/Hiragana.md#17#fwd",
      "Orbits/Hiragana.md#21#fwd",
      "Orbits/Hiragana.md#22#fwd",
    ]);
    assert.equal(stars[1].extra, 'as in "eat"');
    const both = scanDeckCards(KANA, "k.md", "both");
    assert.equal(both.length, 10);
    assert.deepEqual([both[0].dir, both[0].front, both[0].back, both[1].dir, both[1].front, both[1].back], ["fwd", "あ", "a", "rev", "a", "あ"]);
    const reversed = scanDeckCards(KANA, "k.md", "reversed");
    assert.equal(reversed.length, 5);
    assert.deepEqual([reversed[0].dir, reversed[0].front, reversed[0].back, reversed[0].id], ["rev", "a", "あ", "k.md#15#rev"]);
  });
  it("makes two stars of a ::: pair, each with its own schedule", () => {
    const stars = scanDeckCards(PAIRS, "c.md", "basic");
    assert.equal(stars.length, 6);
    const tehran = stars.filter((s) => s.line === 6);
    assert.deepEqual(tehran.map((s) => [s.dir, s.front, s.back, s.schedule?.interval]), [["fwd", "Iran", "Tehran", 6], ["rev", "Tehran", "Iran", 3]]);
    assert.equal(stars[5].extra, "since 762");
    assert.equal(stars[5].dir, "rev");
    // A `reversed` note leaves an explicit pair as the pair it is.
    assert.equal(scanDeckCards(PAIRS, "c.md", "reversed").length, 6);
  });
  it("keeps sections, clozes, blocks and quotes; cloze-only keeps only the clozes", () => {
    const stars = scanDeckCards(MIXED, "a.md", "basic");
    assert.deepEqual(stars.map((s) => [s.kind, s.section]), [["cloze", "Stars"], ["qa", "Stars"], ["quote", "Quotes"], ["qa", "Quotes"]]);
    assert.deepEqual(scanDeckCards(MIXED, "a.md", "cloze-only").map((s) => s.back), ["Proxima Centauri"]);
  });
  it("builds the deck with its sections in order and the note's title as a fallback", () => {
    const c = deckOf(KANA, "Orbits/Hiragana.md", "Hiragana")!;
    assert.equal(c.title, "Hiragana");
    assert.equal(c.icon, "あ");
    assert.deepEqual(c.sections, ["Row a", "Row k"]);
    assert.equal(c.stars.length, 5);
    assert.deepEqual(c.steps, [1, 10, 60]);
    assert.equal(deckOf(PAIRS, "c.md", "capitals")!.title, "Capitals");
    assert.equal(deckOf(LEGACY, "l.md", "Legacy"), null);
    assert.equal(deckOf(MIXED, "a.md", "A")!.sections.length, 2);
  });
});

// ----------------------------------------------------------------- writing

describe("writing a star's schedule", () => {
  const s1 = { due: "2026-10-01", interval: 3, ease: 2500 };
  const s2 = { due: "2026-10-05", interval: 7, ease: 2650 };

  it("writes the forward half of a pair into the first slot and the reverse into the second", () => {
    const [fwd, rev] = scanDeckCards(PAIRS, "c.md", "basic").filter((s) => s.line === 5);
    const afterFwd = writeCardSchedule(PAIRS, fwd, s1);
    assert.ok(afterFwd.includes("Egypt:::Cairo <!--SR:!2026-10-01,3,2500-->\n"));
    const afterBoth = writeCardSchedule(afterFwd, rev, s2);
    assert.ok(afterBoth.includes("Egypt:::Cairo <!--SR:!2026-10-01,3,2500!2026-10-05,7,2650-->\n"));
    const back = scanDeckCards(afterBoth, "c.md", "basic").filter((s) => s.line === 5);
    assert.deepEqual(back.map((s) => s.schedule), [s1, s2]);
    // The other pair's two schedules are untouched.
    assert.ok(afterBoth.includes("Iran:::Tehran <!--SR:!2026-09-20,6,2500!2026-09-25,3,2350-->"));
  });
  it("fills the first slot with a placeholder when the reverse half is graded first, and reads it back as new", () => {
    const [, rev] = scanDeckCards(PAIRS, "c.md", "basic").filter((s) => s.line === 5);
    const afterRev = writeCardSchedule(PAIRS, rev, s1);
    assert.ok(afterRev.includes("Egypt:::Cairo <!--SR:!2026-09-28,0,2500!2026-10-01,3,2500-->\n"));
    const [fwd2, rev2] = scanDeckCards(afterRev, "c.md", "basic").filter((s) => s.line === 5);
    assert.equal(fwd2.schedule, null);
    assert.deepEqual(rev2.schedule, s1);
    const afterFwd = writeCardSchedule(afterRev, fwd2, s2);
    assert.ok(afterFwd.includes("Egypt:::Cairo <!--SR:!2026-10-05,7,2650!2026-10-01,3,2500-->\n"));
  });
  it("replaces one half of an existing two-schedule comment without touching the other", () => {
    const [fwd, rev] = scanDeckCards(PAIRS, "c.md", "basic").filter((s) => s.line === 6);
    const next = writeCardSchedule(PAIRS, rev, s2);
    assert.ok(next.includes("Iran:::Tehran <!--SR:!2026-09-20,6,2500!2026-10-05,7,2650-->"));
    const next2 = writeCardSchedule(next, fwd, s1);
    assert.ok(next2.includes("Iran:::Tehran <!--SR:!2026-10-01,3,2500!2026-10-05,7,2650-->"));
    assert.equal((next2.match(/<!--SR/g) ?? []).length, 1);
  });
  it("knows a `both` note's reverse star from a `reversed` note's lone star", () => {
    const both = "```deck\nkind: both\n```\n\nあ::a\n";
    const rev = scanDeckCards(both, "k.md", "both")[1];
    assert.equal(rev.dir, "rev");
    assert.ok(writeCardSchedule(both, rev, s1).includes("あ::a <!--SR:!2026-09-28,0,2500!2026-10-01,3,2500-->"));
    const reversed = "```deck\nkind: reversed\n```\n\nあ::a\n";
    const lone = scanDeckCards(reversed, "k.md", "reversed")[0];
    assert.equal(lone.dir, "rev");
    assert.ok(writeCardSchedule(reversed, lone, s1).includes("あ::a <!--SR:!2026-10-01,3,2500-->"));
  });
  it("writes after a block, a cloze and a quote as before, with the section untouched", () => {
    const stars = scanDeckCards(MIXED, "a.md", "basic");
    const cloze = writeCardSchedule(MIXED, stars[0], s1);
    assert.ok(cloze.includes("==Proxima Centauri==.\n<!--SR:!2026-10-01,3,2500-->\n"));
    const quote = writeCardSchedule(MIXED, stars[2], s1);
    assert.ok(quote.includes("> We are made of star stuff.\n<!--SR:!2026-10-01,3,2500-->\n"));
    assert.equal(scanDeckCards(quote, "a.md", "basic").length, 4);
  });
  it("leaves a note alone for a star that is gone", () => {
    const ghost = { ...scanDeckCards(KANA, "k.md", "typed")[0], line: 99 };
    assert.equal(writeCardSchedule(KANA, ghost, s1), KANA);
  });
});

// The session's undo: POST /api/orbits/card/review with `restore` writes the
// schedule the star had before the grade back verbatim — or, for a first
// grade, takes the comment out — so the note is the note it was.
describe("restoring a star's schedule", () => {
  const s1 = { due: "2026-10-01", interval: 3, ease: 2500 };
  const s2 = { due: "2026-10-05", interval: 7, ease: 2650 };

  it("puts a previous schedule back verbatim, and strips a first grade's comment byte for byte", () => {
    const stars = scanDeckCards(KANA, "k.md", "typed");
    const graded = writeCardSchedule(KANA, stars[0], s1);
    assert.notEqual(graded, KANA);
    assert.equal(restoreCardSchedule(graded, { ...stars[0], schedule: s1 }, null), KANA);
    // う had a schedule before its grade; restoring it is the old comment again.
    const u = stars[2];
    const regraded = writeCardSchedule(KANA, u, s2);
    assert.ok(regraded.includes("う::u <!--SR:!2026-10-05,7,2650-->"));
    assert.equal(restoreCardSchedule(regraded, { ...u, schedule: s2 }, u.schedule), KANA);
  });
  it("keeps the twin's slot when one half of a pair is un-graded", () => {
    const [fwd, rev] = scanDeckCards(PAIRS, "c.md", "basic").filter((s) => s.line === 6);
    // Iran:::Tehran carries two schedules; undoing the reverse half's first
    // grade would leave the forward one — a trailing slot simply goes.
    const revGone = restoreCardSchedule(PAIRS, rev, null);
    assert.ok(revGone.includes("Iran:::Tehran <!--SR:!2026-09-20,6,2500-->\n"), revGone);
    // Undoing the forward half instead leaves the placeholder the plugin
    // can read and the scanner reads as "new", with the twin's kept.
    const fwdGone = restoreCardSchedule(PAIRS, fwd, null);
    assert.ok(fwdGone.includes("Iran:::Tehran <!--SR:!2026-09-20,0,2500!2026-09-25,3,2350-->\n"), fwdGone);
    const back = scanDeckCards(fwdGone, "c.md", "basic").filter((s) => s.line === 6);
    assert.deepEqual(back.map((s) => s.schedule), [null, { due: "2026-09-25", interval: 3, ease: 2350 }]);
    // Both gone: no comment at all.
    const none = restoreCardSchedule(fwdGone, back[1], null);
    assert.ok(none.includes("Iran:::Tehran\n"), none);
    assert.equal((none.match(/<!--SR/g) ?? []).length, 0);
  });
  it("removes a block's comment line, not the block", () => {
    const stars = scanDeckCards(MIXED, "a.md", "basic");
    const cloze = writeCardSchedule(MIXED, stars[0], s1);
    assert.equal(restoreCardSchedule(cloze, { ...stars[0], schedule: s1 }, null), MIXED);
    const quote = writeCardSchedule(MIXED, stars[2], s1);
    assert.equal(clearSchedule(quote, stars[2].line), MIXED);
    // Nothing to clear is nothing changed.
    assert.equal(clearSchedule(MIXED, stars[0].line), MIXED);
  });
});

// ------------------------------------------------------------- a new note

describe("a new deck note", () => {
  it("serialises the fence and the cards under their sections, and reads back the same", () => {
    const text = serialiseDeck({ title: "Hiragana", icon: "あ", kind: "typed", tags: ["japanese", "#kana"], newPerDay: 5 }, [
      { front: "あ", back: "a", section: "Row a" },
      { front: "い", back: "i", extra: "as in eat", section: "Row a" },
      { front: "か", back: "ka", section: "Row k" },
      { front: "", back: "dropped" },
      // A `::` inside a face is spaced, not collapsed: the importer's rule
      // (tests/deckImport.test.ts), now the one rule — `std::vector` keeps
      // both its colons and still cannot split the line.
      { front: "no::colons", back: "line\nbreak" },
    ]);
    assert.equal(
      text,
      [
        "---",
        "title: Hiragana",
        "---",
        "",
        "```deck",
        "icon: あ",
        "kind: typed",
        "new per day: 5",
        "tags: japanese, kana",
        "```",
        "",
        "## Row a",
        "",
        "あ::a",
        "い::i::as in eat",
        "",
        "## Row k",
        "",
        "か::ka",
        "no: :colons::line break",
        "",
      ].join("\n"),
    );
    const c = deckOf(text, "Orbits/Hiragana.md", "Hiragana")!;
    assert.deepEqual(c.sections, ["Row a", "Row k"]);
    assert.equal(c.stars.length, 4);
    assert.equal(c.kind, "typed");
    assert.equal(c.newPerDay, 5);
    assert.deepEqual(c.tags, ["japanese", "kana"]);
    assert.equal(c.stars[1].extra, "as in eat");
  });
  it("quotes a title YAML would misread and escapes a front that would be a heading", () => {
    const text = serialiseDeck({ title: "Lesson 3: verbs" }, [{ front: "# not a heading", back: "b" }]);
    assert.ok(text.startsWith('---\ntitle: "Lesson 3: verbs"\n---\n\n```deck\ntitle: Lesson 3: verbs\nkind: basic\n```\n'));
    assert.ok(text.includes("\\# not a heading::b\n"));
    const c = deckOf(text, "Orbits/Lesson 3 verbs.md", "Lesson 3 verbs")!;
    assert.equal(c.title, "Lesson 3: verbs");
    assert.equal(c.stars.length, 1);
    // A title the filename keeps whole needs no fence title.
    assert.ok(!serialiseDeck({ title: "Hiragana" }, []).includes("```deck\ntitle:"));
  });
  it("names the file by the composer's rule, in the default folder", () => {
    assert.equal(deckNotePath(undefined, "Hiragana"), "Orbits/Hiragana.md");
    assert.equal(deckNotePath("Study/Decks/", "Lesson 3: verbs [draft] #1"), "Study/Decks/Lesson 3 verbs draft 1.md");
    assert.equal(deckNotePath("", "   "), "Deck.md");
    assert.equal(EVERYTHING_ELSE, "*");
  });
});

// ------------------------------------------------------ two old mistakes

describe("a graded inline card", () => {
  it("is still a card, and a following card's comment is never mistaken for its own", () => {
    // Before: a line ending in the comment was skipped as if it were only a
    // comment, so the first grade made an inline card vanish from the vault.
    const md = "a::b\nc::d <!--SR:!2026-09-20,6,2500-->\n";
    const cards = scanCards(md);
    assert.deepEqual(cards.map((c) => [c.front, c.schedule?.interval ?? null]), [["a", null], ["c", 6]]);
    const graded = writeSchedule(md, 1, { due: "2026-10-01", interval: 1, ease: 2500 });
    assert.equal(graded, "a::b <!--SR:!2026-10-01,1,2500-->\nc::d <!--SR:!2026-09-20,6,2500-->\n");
    assert.equal(scanCards(graded).length, 2);
  });
  it("does not lose a block's neighbour when the block is graded", () => {
    const md = "Q\n?\nA\nc::d <!--SR:!2026-09-20,6,2500-->\n";
    const graded = writeSchedule(md, 1, { due: "2026-10-01", interval: 1, ease: 2500 });
    assert.equal(graded, "Q\n?\nA\n<!--SR:!2026-10-01,1,2500-->\nc::d <!--SR:!2026-09-20,6,2500-->\n");
    assert.equal(scanCards(graded).length, 2);
  });
});

// ---------------------------------------------------------------- the edges
// What the owner will meet mid-session: a line the syntax almost matches, a
// note Obsidian's plugin graded first, a note saved by Windows.

describe("the edges of a card line", () => {
  it("reads an empty extra as no extra, not as an answer ending in ::", () => {
    assert.deepEqual(scanCards("a::b::\n").map((c) => [c.front, c.back, c.extra]), [["a", "b", null]]);
  });
  it("never reads a card inside a code fence, whichever fence", () => {
    assert.deepEqual(scanCards("```\na::b\n```\n~~~\nc:::d\n~~~\nreal::yes\n").map((c) => c.front), ["real"]);
  });
  it("keeps a full-width colon in a Japanese front and back", () => {
    assert.deepEqual(scanCards("日本：東京::Japan: Tokyo\n読み：よみ::reading::example：here\n").map((c) => [c.front, c.back, c.extra]), [
      ["日本：東京", "Japan: Tokyo", null],
      ["読み：よみ", "reading", "example：here"],
    ]);
  });
  it("reads a ::: pair with only its first schedule as half graded", () => {
    const [card] = scanCards("Egypt:::Cairo <!--SR:!2026-09-20,6,2500-->\n");
    assert.equal(card.schedule?.interval, 6);
    assert.equal(card.scheduleRev, null);
  });
  it("reads a comment with spaces inside the markers", () => {
    assert.equal(scanCards("a::b <!-- SR:!2026-09-20,6,2500 -->\n")[0].schedule?.interval, 6);
  });
  it("reads and writes a CRLF note without changing its line endings", () => {
    const crlf = "```deck\r\nkind: both\r\n```\r\n\r\n## S\r\n\r\nx::y\r\nq:::w <!--SR:!2026-09-20,6,2500!2026-09-25,3,2350-->\r\n";
    assert.deepEqual(scanCards(crlf).map((c) => [c.front, c.section, c.scheduleRev?.interval ?? null]), [["x", "S", null], ["q", "S", 3]]);
    assert.equal(parseDeckFence(crlf)?.kind, "both");
    const written = writeSchedule(crlf, 7, { due: "2026-10-01", interval: 1, ease: 2500 }, 1);
    assert.equal(written.includes("\n"), true);
    assert.equal(written.split("\r\n").length, crlf.split("\r\n").length);
    assert.equal(/[^\r]\n/.test(written), false);
    assert.equal(scanCards(written)[0].scheduleRev?.interval, 1);
  });
});

describe("a kind: both note", () => {
  it("keeps the back→front grade of a :: line, and the next front→back grade keeps it too", () => {
    const both = "```deck\nkind: both\n```\n\nx::y\n";
    const stars = scanDeckCards(both, "n.md", "both");
    const rev = writeCardSchedule(both, stars[1], { due: "2026-10-01", interval: 4, ease: 2650 });
    assert.equal(rev, "```deck\nkind: both\n```\n\nx::y <!--SR:!2026-09-27,0,2500!2026-10-01,4,2650-->\n");
    const back = scanDeckCards(rev, "n.md", "both");
    assert.equal(back[0].schedule, null);
    assert.equal(back[1].schedule?.interval, 4);
    const fwd = writeCardSchedule(rev, back[0], { due: "2026-09-16", interval: 1, ease: 2500 });
    assert.equal(fwd, "```deck\nkind: both\n```\n\nx::y <!--SR:!2026-09-16,1,2500!2026-10-01,4,2650-->\n");
  });
});

describe("where the comment goes", () => {
  it("rewrites the plugin's next-line comment in place rather than adding a second", () => {
    const md = "a::b\n<!--SR:!2026-09-20,6,2500-->\nc::d\n";
    const written = writeSchedule(md, 1, { due: "2026-10-01", interval: 10, ease: 2500 });
    assert.equal(written, "a::b\n<!--SR:!2026-10-01,10,2500-->\nc::d\n");
    assert.deepEqual(scanCards(written).map((c) => [c.front, c.schedule?.interval ?? null]), [["a", 10], ["c", null]]);
  });
  it("keeps the second schedule of a two-cloze paragraph the plugin graded", () => {
    const md = "A ==b== and ==c==.\n<!--SR:!2026-09-20,6,2500!2026-09-25,3,2350-->\n";
    const written = writeSchedule(md, 1, { due: "2026-10-01", interval: 15, ease: 2500 });
    assert.equal(written, "A ==b== and ==c==.\n<!--SR:!2026-10-01,15,2500!2026-09-25,3,2350-->\n");
  });
});

describe("a note written from the modal", () => {
  it("folds a newline in the title, the icon and a tag so the fence cannot be closed early", () => {
    const text = serialiseDeck({ title: "Bad\n```\nfoo::bar", icon: "😀\nq::a", tags: ["t\n```", "two words"] }, [{ front: "x", back: "y" }]);
    const head = parseDeckFence(text)!;
    assert.equal(head.title, "Bad ``` foo::bar");
    assert.equal(head.icon, "😀 q::a");
    assert.deepEqual(head.tags, ["t-```", "two-words"]);
    assert.deepEqual(scanCards(text).map((c) => c.front), ["x"]);
  });
  it("never names a file with a leading dot", () => {
    assert.equal(deckNotePath(null, "..."), "Orbits/Deck.md");
    assert.equal(deckNotePath(null, ".hidden"), "Orbits/hidden.md");
  });
});
