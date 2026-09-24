// A note's days (shared/noteDays.ts): which day a note belongs to, and what
// was caught or spoken into it — the Timeline's, Today's and the year in
// review's one reading of the vault by date.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capturedLines, inboxDayOf, isVoiceNotePath, localIso, noteDayOf, publishedDayOf, voiceMarks } from "../shared/noteDays.ts";

describe("the day a note belongs to", () => {
  it("is the frontmatter's day when it spells one, in the indexer's key order", () => {
    assert.equal(noteDayOf({ date: "2024-09-13" }, 0), "2024-09-13");
    assert.equal(noteDayOf({ created: "2023-01-02T10:00" }, 0), "2023-01-02");
    assert.equal(noteDayOf({ date: "2024-09-13", created: "2020-01-01" }, 0), "2024-09-13");
    assert.equal(noteDayOf({ published: "2025-05-05" }, 0), "2025-05-05");
  });

  it("is the LOCAL day of the created instant otherwise", () => {
    const late = new Date(2026, 8, 22, 23, 30).getTime();
    assert.equal(noteDayOf({}, late), "2026-09-22");
    assert.equal(localIso(late), "2026-09-22");
  });

  it("reads the instant when the key the indexer took is not spelled as a day", () => {
    const at = new Date(2026, 2, 4, 12).getTime();
    assert.equal(noteDayOf({ date: "4 March 2026", created: "2020-01-01" }, at), "2026-03-04");
  });

  it("is null for a note with no date at all", () => {
    assert.equal(noteDayOf({}, 0), null);
  });

  it("knows the day a note went out, only when `published:` spells one", () => {
    assert.equal(publishedDayOf({ published: "2026-01-09" }), "2026-01-09");
    assert.equal(publishedDayOf({ published: "true" }), null);
    assert.equal(publishedDayOf({}), null);
  });
});

describe("the inbox and the voice notes", () => {
  it("reads the day an inbox note is for", () => {
    assert.equal(inboxDayOf("Inbox/2026-09-23.md"), "2026-09-23");
    assert.equal(inboxDayOf("Inbox/Voice — hello.md"), null);
    assert.equal(inboxDayOf("Daily/2026-09-23.md"), null);
  });

  it("knows a long transcript's note by its name", () => {
    assert.ok(isVoiceNotePath("Inbox/Voice — the long walk home.md"));
    assert.ok(isVoiceNotePath("Inbox/Voice — the long walk home (2).md"));
    assert.ok(!isVoiceNotePath("Inbox/2026-09-23.md"));
  });
});

describe("what was caught", () => {
  const DAILY = [
    "# Tuesday",
    "",
    "- 09:00 not captured: this is the day's own list",
    "",
    "## Captured",
    "",
    "- 10:02 a thought",
    "  hung under it",
    "- 14:30 another",
    "### a subheading stays in the section",
    "- 15:00 third",
    "```",
    "- 16:00 in a fence",
    "```",
    "## Reflection",
    "- 21:00 after the section",
  ].join("\n");

  it("counts the stamped items under `## Captured` and nothing outside it", () => {
    assert.equal(capturedLines("Daily/2026-09-22.md", DAILY), 3);
  });

  it("counts every stamped item in an inbox note, which has no heading", () => {
    assert.equal(capturedLines("Inbox/2026-09-22.md", "- 10:02 — a shared page\n- 11:15 — [[Voice/x.webm#t=0|🎙]]\nprose\n"), 2);
  });

  it("counts the recordings a note links, and a long transcript's note as one", () => {
    assert.equal(voiceMarks("Inbox/2026-09-22.md", "- 10:02 — hi [[A/Voice/1.webm#t=0|🎙]]\n- 11:00 — [[A/Voice/2.webm#t=0|🎙]]\n"), 2);
    assert.equal(voiceMarks("Inbox/Voice — a walk.md", "![[Voice/3.webm]]\n\nwords\n"), 1);
    assert.equal(voiceMarks("Notes/Plain.md", "nothing spoken"), 0);
  });
});
