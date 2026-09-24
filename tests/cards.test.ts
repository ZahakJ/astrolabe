import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scanCards, writeSchedule } from "../shared/cards.ts";
import { formatSrComment, isDue, parseSrComment, review } from "../shared/srs.ts";

describe("SM-2", () => {
  it("walks 1, 6, then interval × ease on good; resets on again", () => {
    const a = review(null, "good", "2026-09-14");
    assert.deepEqual(a, { due: "2026-09-15", interval: 1, ease: 2500 });
    const b = review(a, "good", "2026-09-15");
    assert.equal(b.interval, 6);
    const c = review(b, "good", "2026-09-21");
    assert.equal(c.interval, 15);
    const d = review(c, "again", "2026-10-06");
    assert.deepEqual(d, { due: "2026-10-07", interval: 1, ease: 2300 });
    assert.equal(review(c, "easy", "2026-10-06").ease, 2650);
    assert.ok(review({ due: "x", interval: 10, ease: 1300 }, "hard", "2026-10-06").ease >= 1300);
  });
  it("round-trips the plugin's comment and knows what is due", () => {
    const s = parseSrComment("<!--SR:!2026-09-27,4,250-->")!;
    assert.deepEqual(s, { due: "2026-09-27", interval: 4, ease: 250 });
    assert.equal(formatSrComment(s), "<!--SR:!2026-09-27,4,250-->");
    assert.equal(isDue(s, "2026-09-27"), true);
    assert.equal(isDue(s, "2026-09-26"), false);
    assert.equal(isDue(null, "2026-01-01"), true);
  });
});

const NOTE = `---
title: x
---
# Cards

What is the rule of three?
?
Never keep fewer than three copies.
<!--SR:!2026-09-20,6,2500-->

Capital of Egypt::Cairo

The ==mitochondria== is the powerhouse of the ==cell==.

> [!quote] Ibn Khaldun, p. 12
> History is the record of human society.
> It has many aspects.

- [ ] not a card::really
`;

describe("cards in a note", () => {
  it("finds the block Q/A, the inline Q/A, the cloze paragraph and the quote", () => {
    const cards = scanCards(NOTE);
    assert.deepEqual(cards.map((c) => [c.kind, c.line, c.end]), [["qa", 6, 8], ["qa", 11, 11], ["cloze", 13, 13], ["quote", 15, 17]]);
    assert.equal(cards[0].front, "What is the rule of three?");
    assert.equal(cards[0].schedule?.interval, 6);
    assert.equal(cards[1].back, "Cairo");
    assert.equal(cards[2].front, "The **[…]** is the powerhouse of the **[…]**.");
    assert.equal(cards[2].back, "mitochondria · cell");
    assert.ok(cards[3].front.startsWith("**Ibn Khaldun, p. 12**"));
    assert.equal(cards[3].back, "History is the record of human society.\nIt has many aspects.");
    assert.equal(cards[3].schedule, null);
  });
  it("writes a schedule after a block, on an inline line, and replaces one already there", () => {
    const s = { due: "2026-10-01", interval: 3, ease: 2500 };
    const next = writeSchedule(NOTE, 6, s);
    assert.ok(next.includes("Never keep fewer than three copies.\n<!--SR:!2026-10-01,3,2500-->\n\nCapital"));
    assert.equal(scanCards(next).filter((c) => c.kind === "qa").length, 2);
    const inline = writeSchedule(NOTE, 11, s);
    assert.ok(inline.includes("Capital of Egypt::Cairo <!--SR:!2026-10-01,3,2500-->"));
    // The reviewed inline card is still a card, with its schedule read back.
    const reviewed = scanCards(inline).find((c) => c.line === 11);
    assert.deepEqual(reviewed && [reviewed.front, reviewed.back, reviewed.schedule], ["Capital of Egypt", "Cairo", s]);
    const quote = writeSchedule(NOTE, 15, s);
    assert.ok(quote.includes("> It has many aspects.\n<!--SR:!2026-10-01,3,2500-->\n"));
    const again = writeSchedule(quote, 15, { ...s, interval: 9 });
    assert.equal((again.match(/SR:!2026-10-01,9,2500/g) ?? []).length, 1);
    assert.equal((again.match(/<!--SR/g) ?? []).length, 2);
  });
});
