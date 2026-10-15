// `publish:` as a time (shared/publishAt.ts), the server's flag over it
// (server/publish.ts), the client's mirror (client/publish.ts), and the word
// goal the status bar draws beside it (shared/wordGoal.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publishAtMs, publishedAt } from "../shared/publishAt.ts";
import { publishFlag, readFrontmatter, scheduledPublish } from "../server/publish.ts";
import { isPublishedContent, scheduledAtContent } from "../client/publish.ts";
import { goalProgress, wordGoalOf } from "../shared/wordGoal.ts";

const local = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

describe("publish: <date>", () => {
  it("reads a date as local midnight and a time as local time", () => {
    assert.equal(publishAtMs("2026-11-02"), local(2026, 11, 2));
    assert.equal(publishAtMs("2026-11-02 09:30"), local(2026, 11, 2, 9, 30));
    assert.equal(publishAtMs("2026-11-02T09:30"), local(2026, 11, 2, 9, 30));
    assert.equal(publishAtMs('"2026-11-02 09:30"'), local(2026, 11, 2, 9, 30));
  });

  it("honours an explicit zone", () => {
    assert.equal(publishAtMs("2026-11-02T09:30Z"), Date.UTC(2026, 10, 2, 9, 30));
    assert.equal(publishAtMs("2026-11-02T09:30+03:00"), Date.UTC(2026, 10, 2, 6, 30));
    assert.equal(publishAtMs("2026-11-02 09:30 -0700"), Date.UTC(2026, 10, 2, 16, 30));
  });

  it("reads YAML's bare-date Date back as the calendar day it named", () => {
    // gray-matter hands `publish: 2026-11-02` over as UTC midnight.
    const fm = readFrontmatter("---\npublish: 2026-11-02\n---\nbody");
    assert.ok(fm.publish instanceof Date);
    assert.equal(publishAtMs(fm.publish), local(2026, 11, 2));
  });

  it("is not a date for true, false, words or an impossible day", () => {
    for (const v of [true, false, "true", "yes", "soon", "2026-02-31", "2026-13-01", "2026-11-02 25:00", 20261102, null]) {
      assert.equal(publishAtMs(v), null, String(v));
    }
  });

  it("publishes true at once and a date once it has come", () => {
    const at = local(2026, 11, 2, 9);
    assert.equal(publishedAt(true, at), true);
    assert.equal(publishedAt("true", at), true);
    assert.equal(publishedAt("2026-11-02 09:00", at - 1), false);
    assert.equal(publishedAt("2026-11-02 09:00", at), true);
    assert.equal(publishedAt(false, at), false);
  });

  it("the server and the status bar agree, before and after the moment", () => {
    const src = "---\npublish: 2026-11-02 09:00\ntitle: x\n---\nbody";
    const fm = readFrontmatter(src);
    const at = local(2026, 11, 2, 9);
    for (const now of [at - 60_000, at, at + 60_000]) {
      assert.equal(publishFlag(fm, now), isPublishedContent(src, now), `at ${now - at}`);
    }
    assert.equal(scheduledPublish(fm, at - 1), at);
    assert.equal(scheduledAtContent(src, at - 1), at);
    assert.equal(scheduledPublish(fm, at), null);
    assert.equal(scheduledAtContent(src, at), null);
  });

  it("keeps the old exactness for the boolean", () => {
    assert.equal(isPublishedContent("---\npublish: true\n---\n"), true);
    assert.equal(isPublishedContent('---\npublish: "True"\n---\n'), false);
    assert.equal(publishFlag(readFrontmatter('---\npublish: "True"\n---\n')), false);
  });
});

describe("goal:", () => {
  it("reads a plain number in any of the usual spellings", () => {
    assert.equal(wordGoalOf("---\ngoal: 3000\n---\n"), 3000);
    assert.equal(wordGoalOf("---\ngoal: 3,000\n---\n"), 3000);
    assert.equal(wordGoalOf('---\ngoal: "1500"\n---\n'), 1500);
    assert.equal(wordGoalOf("---\ngoal: ٢٥٠٠\n---\n"), 2500);
  });

  it("leaves everything else alone", () => {
    assert.equal(wordGoalOf("---\ngoal: finish the draft\n---\n"), null);
    assert.equal(wordGoalOf("---\ngoal: 0\n---\n"), null);
    assert.equal(wordGoalOf("goal: 3000\n"), null);
    assert.equal(wordGoalOf("---\ntitle: a\n---\ngoal: 3000\n"), null);
  });

  it("measures progress from nothing to done", () => {
    assert.equal(goalProgress(0, 1000), 0);
    assert.equal(goalProgress(250, 1000), 0.25);
    assert.equal(goalProgress(1500, 1000), 1);
  });
});
