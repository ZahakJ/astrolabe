// Sittings from progress: the rule (shared/sittings.ts) and the server's
// detection (server/sittings.ts, hooked into the indexer's read of a note).
//
// The owner's words: "I read 4 of my books today and update the tracker for
// them — they should all show as reading under today." So the server half is
// tested as a day of moves on real files: forward, backward, the reader's own
// save, a second press, `sittings: manual`, four books at once, and a restart.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  appendSittingLine,
  DEFAULT_MINUTES,
  estimateMinutes,
  estimatedSession,
  isReadingTracker,
  minutesPerUnit,
  observeProgress,
  replaceSittingLine,
  sittingUnit,
  type SeenTracker,
} from "../shared/sittings.ts";
import { formatSessionLine, parseSessionLine, parseTracker, readingSpeed, type TrackerSession } from "../shared/tracker.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

const measured = (date: string, pages: number, minutes: number): TrackerSession => ({ date, from: null, to: null, pages, minutes });

describe("the mark", () => {
  it("reads ~ as estimated, `default pace` as the default's, and a count in any unit", () => {
    assert.deepEqual(parseSessionLine("2026-09-27 | 139–160 | 21 pages | ~32 min"), {
      date: "2026-09-27", from: 139, to: 160, pages: 21, minutes: 32, estimate: "pace",
    });
    assert.deepEqual(parseSessionLine("2026-09-27 | 3–5 | 2 chapters | ~60 min | default pace"), {
      date: "2026-09-27", from: 3, to: 5, pages: 0, minutes: 60, estimate: "default", count: 2, unit: "chapters",
    });
    // Arabic digits and words, the mark kept.
    assert.equal(parseSessionLine("٢٠٢٦-٠٩-٢٧ | ٢١ صفحة | ~٣٢ د")?.estimate, "pace");
    // A measured line stays exactly what it was.
    assert.deepEqual(parseSessionLine("2026-09-15 | 112–139 | 27 pages | 41 min"), { date: "2026-09-15", from: 112, to: 139, pages: 27, minutes: 41 });
    // Hours are time, not a count.
    assert.equal(parseSessionLine("2026-09-15 | 40 pages | 1 h")?.minutes, 60);
  });

  it("writes the line it reads back, byte for byte", () => {
    for (const line of [
      "2026-09-27 | 139–160 | 21 pages | ~32 min",
      "2026-09-27 | 2 chapters | ~60 min | default pace",
      "2026-09-27 | 10–20 | 10 pages | ~15 min | default pace",
    ]) {
      assert.equal(formatSessionLine(parseSessionLine(line)!), line);
    }
  });

  it("keeps estimated sittings out of the card's reading speed", () => {
    const sessions = [measured("2026-09-01", 30, 20), { ...measured("2026-09-02", 30, 90), estimate: "default" as const }];
    assert.equal(readingSpeed(sessions), 1.5);
  });
});

describe("the estimate", () => {
  it("prefers the tracker's own measured pace", () => {
    const own = [measured("2026-09-01", 20, 40), measured("2026-09-02", 20, 40)];
    assert.deepEqual(estimateMinutes({ count: 10, unit: null, own, vault: [], total: 300, bookPages: null }), { minutes: 20, basis: "pace" });
  });

  it("falls back to the vault's measured sittings in the same unit, then to the default", () => {
    const vault = [measured("2026-09-01", 30, 30)];
    assert.deepEqual(estimateMinutes({ count: 10, unit: "pages", own: [], vault, total: null, bookPages: null }), { minutes: 10, basis: "pace" });
    assert.deepEqual(estimateMinutes({ count: 10, unit: "صفحات", own: [], vault: [], total: null, bookPages: null }), { minutes: 15, basis: "default" });
    assert.equal(DEFAULT_MINUTES.pages, 1.5);
  });

  it("never reads an estimate as pace", () => {
    const own = [{ ...measured("2026-09-01", 20, 400), estimate: "pace" as const }];
    assert.equal(minutesPerUnit(own, "pages"), null);
  });

  it("spreads the book's pages over its chapters, else the chapter default", () => {
    // 300 pages in 12 chapters = 25 pages a chapter, at the default 1.5.
    assert.deepEqual(estimateMinutes({ count: 2, unit: "chapters", own: [], vault: [], total: 12, bookPages: 300 }), { minutes: 75, basis: "default" });
    // …at the reader's own page pace when there is one.
    assert.deepEqual(estimateMinutes({ count: 2, unit: "chapters", own: [measured("2026-09-01", 50, 50)], vault: [], total: 12, bookPages: 300 }), { minutes: 50, basis: "pace" });
    assert.deepEqual(estimateMinutes({ count: 2, unit: "فصول", own: [], vault: [], total: 12, bookPages: null }), { minutes: 60, basis: "default" });
    assert.equal(sittingUnit("Sections"), "sections");
    assert.equal(sittingUnit("volumes"), "parts");
    assert.equal(sittingUnit("stanzas"), "other");
  });

  it("builds the line with the unit's own word", () => {
    assert.equal(formatSessionLine(estimatedSession("2026-09-27", 3, 5, 2, "chapters", { minutes: 60, basis: "default" })), "2026-09-27 | 3–5 | 2 chapters | ~60 min | default pace");
    assert.equal(formatSessionLine(estimatedSession("2026-09-27", 62.5, 70, 7.5, null, { minutes: 11, basis: "pace" })), "2026-09-27 | 7.5 pages | ~11 min");
  });
});

describe("which trackers are reading", () => {
  it("is a book, or a bare fence in pages — never a game's hours", () => {
    assert.ok(isReadingTracker(parseTracker("title: A\nkind: book\nunit: chapters\nprogress: 1/9")!));
    assert.ok(isReadingTracker(parseTracker("title: A\nkind: novel\nprogress: 1/9")!));
    assert.ok(isReadingTracker(parseTracker("title: A\nunit: pages\nprogress: 1/9")!));
    assert.ok(!isReadingTracker(parseTracker("title: A\nkind: game\nprogress: 1/9")!));
    assert.ok(!isReadingTracker(parseTracker("title: A\nprogress: 1/9")!));
  });
});

describe("observeProgress", () => {
  const book = (progress: string, extra = "") => parseTracker(`title: Dune\nkind: book\nprogress: ${progress}\n${extra}`)!;
  const today = "2026-09-27";
  const seen = (over: Partial<SeenTracker> = {}): SeenTracker => ({ title: "Dune", done: 50, high: 50, day: today, measured: [], line: null, ...over });

  it("writes nothing on a first sighting", () => {
    assert.equal(observeProgress(undefined, book("50/300"), today).action, null);
  });
  it("answers a forward move with a sitting from the last value", () => {
    assert.deepEqual(observeProgress(seen(), book("70/300"), today).action, { kind: "add", from: 50, to: 70 });
  });
  it("counts from the day's high-water mark, not from a dip typed on the way", () => {
    const dip = observeProgress(seen(), book("7/300"), today);
    assert.equal(dip.action, null);
    assert.deepEqual(observeProgress(dip.seen!, book("70/300"), today).action, { kind: "add", from: 50, to: 70 });
    // …but a new day starts where the last one ended.
    assert.deepEqual(observeProgress(dip.seen!, book("20/300"), "2026-09-28").action, { kind: "add", from: 7, to: 20 });
  });
  it("gives back what the day's own line counted when the number goes down", () => {
    const line = "2026-09-27 | 50–70 | 20 pages | ~30 min | default pace";
    const t = book("60/300", `sessions: |\n  ${line}\n`);
    assert.deepEqual(observeProgress(seen({ done: 70, high: 70, line }), t, today).action, { kind: "shrink", by: 10 });
    // A line the owner edited is not the instance's to shrink.
    const edited = book("60/300", "sessions: |\n  2026-09-27 | 50–70 | 20 pages | 25 min\n");
    assert.equal(observeProgress(seen({ done: 70, high: 70, line, measured: [] }), edited, today).action, null);
  });
  it("leaves a move the save's own sitting accounts for", () => {
    const t = book("80/300", "sessions: |\n  2026-09-27 | 50–80 | 30 pages | 40 min\n");
    assert.equal(observeProgress(seen(), t, today).action, null);
  });
  it("is off under `sittings: manual`, and for a game", () => {
    assert.equal(observeProgress(seen(), book("70/300", "sittings: manual\n"), today).action, null);
    const game = parseTracker("title: Dune\nkind: game\nprogress: 70/300")!;
    assert.equal(observeProgress(seen(), game, today).action, null);
  });
  it("meets a renamed tracker fresh", () => {
    assert.equal(observeProgress(seen({ title: "Other" }), book("70/300"), today).action, null);
  });
});

describe("the block, edited one line at a time", () => {
  it("appends at the block's own indent and leaves the other lines alone", () => {
    const body = "title: A\nsessions: |\n    2026-09-01 | 10 pages | 12 min\nnotes: |\n  hi\n";
    assert.equal(appendSittingLine(body, "2026-09-27 | 5 pages | ~8 min"), "title: A\nsessions: |\n    2026-09-01 | 10 pages | 12 min\n    2026-09-27 | 5 pages | ~8 min\nnotes: |\n  hi\n");
    assert.equal(appendSittingLine("title: A\n", "x"), null);
  });
  it("replaces or removes only the exact line", () => {
    const body = "title: A\nsessions: |\n  2026-09-01 | 10 pages | 12 min\n  2026-09-27 | 5 pages | ~8 min\n";
    assert.equal(replaceSittingLine(body, "2026-09-27 | 5 pages | ~8 min", "2026-09-27 | 9 pages | ~14 min"), "title: A\nsessions: |\n  2026-09-01 | 10 pages | 12 min\n  2026-09-27 | 9 pages | ~14 min\n");
    assert.equal(replaceSittingLine(body, "2026-09-27 | 5 pages | ~8 min", null), "title: A\nsessions: |\n  2026-09-01 | 10 pages | 12 min\n");
    assert.equal(replaceSittingLine("title: A\nsessions: |\n  2026-09-27 | 5 pages | ~8 min\n", "2026-09-27 | 5 pages | ~8 min", null), "title: A\n");
    assert.equal(replaceSittingLine(body, "2026-09-27 | 6 pages | ~8 min", null), null);
  });
});

// ─── The server: real notes, the indexer's own read ─────────────────────────

const fence = (title: string, progress: string, extra = "") => `# ${title}\n\n\`\`\`tracker\ntitle: ${title}\nkind: book\nprogress: ${progress}\n${extra}\`\`\`\n\nMy notes.\n`;

const data = makeDir();
const root = makeVault({
  "Media/Books/Dune.md": fence("Dune", "50/300", "sessions: |\n  2026-09-20 | 10–50 | 40 pages | 60 min\n"),
  "Media/Books/Emma.md": fence("Emma", "10/400"),
  "Media/Books/Kim.md": fence("Kim", "10/200"),
  "Media/Books/Ulysses.md": fence("Ulysses", "10/700"),
  "Media/Books/Manual.md": fence("Manual", "10/100", "sittings: manual\n"),
  "Media/Games/Elden.md": "```tracker\ntitle: Elden\nkind: game\nprogress: 10/100\n```\n",
});

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let server: {
  vault: typeof import("../server/vault.ts");
  indexer: typeof import("../server/indexer.ts");
  sittings: typeof import("../server/sittings.ts");
};

before(async () => {
  const { initSite } = await import("../server/site.ts");
  initSite({ ASTROLABE_DATA: data });
  const vault = await import("../server/vault.ts");
  vault.initVault(root);
  const sittings = await import("../server/sittings.ts");
  const indexer = await import("../server/indexer.ts");
  sittings.setSittingsClock(() => new Date(2026, 8, 27, 12));
  sittings.initSittings();
  await indexer.initIndexer();
  server = { vault, indexer, sittings };
});

after(() => {
  removeVault(root);
  removeVault(data);
});

/** A save, the way PUT /api/note makes one: write, then the index reads it. */
async function save(rel: string, edit: (text: string) => string): Promise<string> {
  const note = await server.vault.readNote(rel);
  await server.vault.writeNote(rel, edit(note.content), note.mtimeMs);
  await server.indexer.indexFile(rel);
  return readFileSync(path.join(root, rel), "utf8");
}
const setProgress = (to: string) => (text: string) => text.replace(/progress: [^\n]+/, `progress: ${to}`);
const sessionsOf = (text: string) => parseTracker(/```tracker\n([\s\S]*?)```/.exec(text)![1])!.sessions;

describe("detection on the server", () => {
  it("met every tracker at boot and wrote nothing", () => {
    assert.ok(!readFileSync(path.join(root, "Media/Books/Emma.md"), "utf8").includes("sessions"));
    assert.ok(existsSync(path.join(data, "trackers-progress.json")));
  });

  it("a forward move writes one estimated line for today, at the book's own pace", async () => {
    const text = await save("Media/Books/Dune.md", setProgress("70/300"));
    assert.ok(text.includes("  2026-09-27 | 50–70 | 20 pages | ~30 min\n"), text);
    // The measured line and the prose are as they were.
    assert.ok(text.includes("  2026-09-20 | 10–50 | 40 pages | 60 min\n"));
    assert.ok(text.endsWith("```\n\nMy notes.\n"));
  });

  it("a second move the same day folds into the same line", async () => {
    const text = await save("Media/Books/Dune.md", setProgress("80/300"));
    const today = sessionsOf(text).filter((s) => s.date === "2026-09-27");
    assert.equal(today.length, 1);
    assert.deepEqual(today[0], { date: "2026-09-27", from: 50, to: 80, pages: 30, minutes: 45, estimate: "pace" });
  });

  it("a move backwards writes nothing new and takes back what the line counted", async () => {
    const text = await save("Media/Books/Dune.md", setProgress("75/300"));
    const today = sessionsOf(text).filter((s) => s.date === "2026-09-27");
    assert.equal(today.length, 1);
    assert.equal(today[0].pages, 25);
    assert.equal(today[0].to, 75);
  });

  it("a save that brings its own sitting is left alone", async () => {
    const text = await save("Media/Books/Dune.md", (t) => setProgress("95/300")(t).replace("sessions: |\n", "sessions: |\n  2026-09-27 | 75–95 | 20 pages | 25 min\n"));
    assert.equal(sessionsOf(text).filter((s) => s.date === "2026-09-27").length, 2);
  });

  it("four books moved on one day are four sittings under that day", async () => {
    for (const [rel, to] of [["Media/Books/Emma.md", "40/400"], ["Media/Books/Kim.md", "25/200"], ["Media/Books/Ulysses.md", "30/700"]] as const) {
      const text = await save(rel, setProgress(to));
      assert.equal(sessionsOf(text).length, 1, rel);
    }
    const { agendaByDay } = await import("../shared/dayAgenda.ts");
    const trackers = server.indexer.trackers(false, null).filter((t) => t.kind === "book");
    const agenda = agendaByDay(["2026-09-27"], { notes: new Map(), sigils: [], trackers, grades: [] }, "2026-09-27");
    assert.deepEqual(agenda.get("2026-09-27")!.trackers.map((t) => t.title).sort(), ["Dune", "Emma", "Kim", "Ulysses"]);
    // Emma and Kim have no measured sittings of their own: the vault's pace
    // (Dune's measured lines) is what their minutes rest on.
    const emma = sessionsOf(readFileSync(path.join(root, "Media/Books/Emma.md"), "utf8"))[0];
    assert.equal(emma.estimate, "pace");
  });

  it("writes nothing under `sittings: manual`, or for a game", async () => {
    assert.ok(!(await save("Media/Books/Manual.md", setProgress("40/100"))).includes("~"));
    assert.ok(!(await save("Media/Games/Elden.md", setProgress("40/100"))).includes("sessions"));
  });

  it("never re-adds a line the owner deleted, and a restart counts nothing twice", async () => {
    const rel = "Media/Books/Kim.md";
    const cut = await save(rel, (t) => t.replace(/sessions: \|\n[^\n]*\n/, ""));
    assert.ok(!cut.includes("sessions"));
    server.sittings.forgetSittingsMemory(); // the instance restarts…
    await server.indexer.indexFile(rel); // …and reads the note again
    assert.ok(!readFileSync(path.join(root, rel), "utf8").includes("sessions"));
    // A real move after the restart still counts, from where it stood.
    const text = await save(rel, setProgress("35/200"));
    assert.deepEqual(sessionsOf(text).map((s) => [s.from, s.to, s.pages]), [[25, 35, 10]]);
  });

  it("hands the rewrite to the save that caused it, once", async () => {
    await save("Media/Books/Ulysses.md", setProgress("40/700"));
    const hit = server.sittings.takeSittingRewrite("Media/Books/Ulysses.md");
    assert.ok(hit !== null && hit.content.includes("10–40 | 30 pages"));
    assert.equal(server.sittings.takeSittingRewrite("Media/Books/Ulysses.md"), null);
  });
});
