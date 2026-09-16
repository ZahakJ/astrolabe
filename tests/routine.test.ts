// Routines: the plan parser, the log's byte discipline, the statistics, and
// the edit that writes a day into a note (shared/routine.ts). Pure, like
// tests/tracker.test.ts, and for the same reason: a streak off by one looks
// exactly like a streak that is right.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyEdit,
  dayStatus,
  draftOf,
  fieldSpec,
  editRoutinePlan,
  formatLogLine,
  logEditFor,
  mergeEntry,
  parseLogLine,
  parseRoutine,
  parseRoutineLog,
  routineFenceBody,
  routineFenceSpans,
  routineNoteContent,
  routinesRootFor,
  routineStats,
  scanRoutines,
  tasksFor,
  upsertLogLine,
  weekStart,
  weekdayOfDate,
  carriedTasks,
} from "../shared/routine.ts";
import { ROUTINE_PRESETS } from "../shared/routinePresets.ts";

const PLAN = `title: Weekly exercise
kind: exercise
slots: morning, evening
fields: minutes:number, weight:number:kg, mood:scale:5
target: 6/week
monday:
  morning: 60 min brisk walk
  evening: Full Body A: leg press 3×8–12
tuesday: 20 min easy walk
sunday:
  morning: 60 min walk
notes: |
  Walk first.
`;

describe("a routine plan", () => {
  it("reads title, kind, slots, fields, target and the week", () => {
    const plan = parseRoutine(PLAN);
    assert.ok(plan);
    assert.equal(plan.title, "Weekly exercise");
    assert.equal(plan.kindKey, "exercise");
    assert.equal(plan.icon, "heart");
    assert.deepEqual(plan.slots, ["morning", "evening"]);
    assert.equal(plan.target, 6);
    assert.deepEqual(plan.fields.map((f) => [f.key, f.type, f.unit, f.max]), [
      ["minutes", "number", null, null],
      ["weight", "number", "kg", null],
      ["mood", "scale", null, 5],
    ]);
    // A value holding a colon keeps it whole: the first colon splits.
    assert.equal(plan.week.mon[1].text, "Full Body A: leg press 3×8–12");
    // A single-line weekday is one unnamed slot.
    assert.deepEqual(plan.week.tue, [{ slot: "", text: "20 min easy walk" }]);
    assert.deepEqual(plan.week.wed, []);
    assert.equal(plan.notes, "Walk first.");
  });
  it("is null with neither a title nor a plan, and reads Arabic weekdays", () => {
    assert.equal(parseRoutine("kind: exercise\n"), null);
    const ar = parseRoutine("عنوان: الصلوات\nالجمعة: خطبة\nيوميًا: الفجر، العصر\n");
    assert.ok(ar);
    assert.deepEqual(ar.items, ["الفجر", "العصر"]);
    assert.equal(ar.week.fri[0].text, "خطبة");
  });
  it("names a day's tasks: items first, then the weekday's slots", () => {
    const plan = parseRoutine("title: x\nitems: stretch\nmonday:\n  morning: walk\n")!;
    assert.deepEqual(
      tasksFor(plan, "2026-09-14").map((t) => t.key),
      ["stretch", "morning"],
    );
    // An unnamed weekday line is keyed by the weekday itself.
    const one = parseRoutine("title: x\ntuesday: walk\n")!;
    assert.deepEqual(tasksFor(one, "2026-09-15").map((t) => t.key), ["tue"]);
  });
});

describe("a routine log", () => {
  const fields = parseRoutine(PLAN)!.fields;
  it("reads a line by segments: done, skipped, declared fields, then the note", () => {
    const e = parseLogLine("2026-09-13 | done: morning, evening | minutes: 62 | weight: 84.2 | Felt strong: no pain", fields)!;
    assert.equal(e.date, "2026-09-13");
    assert.deepEqual(e.done, ["morning", "evening"]);
    assert.deepEqual(e.values, { minutes: "62", weight: "84.2" });
    // A segment with a colon whose key is not a field is prose, not a value.
    assert.equal(e.note, "Felt strong: no pain");
  });
  it("folds Eastern Arabic digits and ignores lines without a date", () => {
    assert.equal(parseLogLine("notes go here", fields), null);
    const e = parseLogLine("٢٠٢٦-٠٩-١٣ | minutes: ٤٥", fields)!;
    assert.equal(e.date, "2026-09-13");
    assert.equal(e.values.minutes, "45");
  });
  it("writes a line in reading order and softens bars in a note", () => {
    const line = formatLogLine({ date: "2026-09-13", done: ["morning"], skipped: ["evening"], deferred: [], values: { weight: "84", minutes: "60" }, note: "a | b" }, fields);
    assert.equal(line, "2026-09-13 | done: morning | skipped: evening | minutes: 60 | weight: 84 | a / b");
  });
  it("upserts one line and leaves every other byte, CRLF included", () => {
    const body = "2026-09-11 | done: morning\r\n2026-09-13 | minutes: 30\r\n";
    const next = upsertLogLine(body, { date: "2026-09-12", done: ["morning"], skipped: [], deferred: [], values: {}, note: null }, fields);
    assert.equal(next, "2026-09-11 | done: morning\r\n2026-09-12 | done: morning\r\n2026-09-13 | minutes: 30\r\n");
    const replaced = upsertLogLine(next, { date: "2026-09-13", done: [], skipped: [], deferred: [], values: { minutes: "45" }, note: null }, fields);
    assert.equal(replaced, "2026-09-11 | done: morning\r\n2026-09-12 | done: morning\r\n2026-09-13 | minutes: 45\r\n");
    const removed = upsertLogLine(replaced, { date: "2026-09-12", done: [], skipped: [], deferred: [], values: {}, note: null }, fields);
    assert.equal(removed, "2026-09-11 | done: morning\r\n2026-09-13 | minutes: 45\r\n");
  });
  it("merges a patch: lists replace, values set or clear, done wins over skipped", () => {
    const base = parseLogLine("2026-09-13 | done: morning | skipped: evening | minutes: 30", fields);
    const merged = mergeEntry(base, { date: "2026-09-13", done: ["morning", "evening"], values: { minutes: "", weight: "84" } });
    assert.deepEqual(merged.done, ["morning", "evening"]);
    assert.deepEqual(merged.skipped, []);
    assert.deepEqual(merged.values, { weight: "84" });
  });
  it("keeps the last line for a duplicated date", () => {
    const entries = parseRoutineLog("2026-09-13 | minutes: 1\n2026-09-13 | minutes: 2\n", fields);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].values.minutes, "2");
  });
});

describe("weeks and days", () => {
  it("knows the weekday of a date and where the week starts, per language", () => {
    assert.equal(weekdayOfDate("2026-09-13"), "sun");
    assert.equal(weekStart("2026-09-13", "en"), "2026-09-07");
    assert.equal(weekStart("2026-09-13", "ar"), "2026-09-12");
  });
  it("judges a day: complete, partial, missed, rest, none", () => {
    const plan = parseRoutine(PLAN)!;
    const today = "2026-09-14"; // a Monday
    const full = { date: today, done: ["morning", "Evening"], skipped: [], deferred: [], values: {}, note: null };
    assert.equal(dayStatus(plan, full, today, today), "complete");
    assert.equal(dayStatus(plan, { ...full, done: ["morning"] }, today, today), "partial");
    assert.equal(dayStatus(plan, null, today, today), "none");
    assert.equal(dayStatus(plan, null, "2026-09-07", today), "missed");
    assert.equal(dayStatus(plan, null, "2026-09-09", today), "rest"); // a Wednesday: no plan
  });
});

describe("statistics", () => {
  it("counts a streak through rest days and stops at a miss", () => {
    const plan = parseRoutine("title: x\nmonday: a\ntuesday: b\nthursday: c\nfriday: d\n")!;
    const entries = parseRoutineLog(
      ["2026-09-07 | done: mon", "2026-09-08 | done: tue", "2026-09-10 | done: thu", "2026-09-11 | done: fri"].join("\n"),
      [],
    );
    // Saturday 2026-09-12: yesterday Friday complete, Wednesday a rest day.
    const stats = routineStats(plan, entries, "2026-09-12");
    assert.equal(stats.streak, 4);
    assert.equal(stats.week.done, 4);
    assert.equal(stats.week.of, 4);
    assert.equal(stats.heat.length, 12);
    assert.equal(stats.heat[11][0].date, "2026-09-07");
    // Miss Thursday and the streak is Friday alone.
    const broken = routineStats(plan, entries.filter((e) => e.date !== "2026-09-10"), "2026-09-12");
    assert.equal(broken.streak, 1);
  });
  it("does not call the days before the first entry missed", () => {
    const plan = parseRoutine("title: x\nitems: walk\n")!;
    const fresh = routineStats(plan, [], "2026-09-13");
    assert.ok(fresh.heat.flat().every((c) => c.status === "none" || c.date === "2026-09-13"));
    const started = routineStats(plan, parseRoutineLog("2026-09-12 | done: walk\n", []), "2026-09-13");
    const cells = new Map(started.heat.flat().map((c) => [c.date, c.status]));
    assert.equal(cells.get("2026-09-11"), "none");
    assert.equal(cells.get("2026-09-12"), "complete");
    assert.equal(started.streak, 1);
  });
  it("uses the target as the week's denominator when one is set", () => {
    const plan = parseRoutine("title: x\ntarget: 3/week\nitems: walk\n")!;
    const stats = routineStats(plan, [], "2026-09-12");
    assert.equal(stats.week.of, 3);
  });
});

describe("a note carrying a routine", () => {
  const NOTE = `# Fitness\n\n\`\`\`routine\n${PLAN}\`\`\`\n\nSome prose.\n`;
  it("pairs a plan with the log that follows it", () => {
    const withLog = `${NOTE}\n\`\`\`routine-log\n2026-09-13 | done: morning\n\`\`\`\n`;
    const blocks = scanRoutines(withLog);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].hasLog, true);
    assert.equal(blocks[0].entries[0].done[0], "morning");
    assert.equal(routineFenceSpans(withLog).length, 2);
  });
  it("writes the first day as a new log fence right under the plan", () => {
    const edit = logEditFor(NOTE, 0, { date: "2026-09-13", done: ["morning"] });
    assert.ok(edit);
    const next = applyEdit(NOTE, edit);
    assert.equal(
      next,
      `# Fitness\n\n\`\`\`routine\n${PLAN}\`\`\`\n\n\`\`\`routine-log\n2026-09-13 | done: morning\n\`\`\`\n\nSome prose.\n`,
    );
    // The second day lands INSIDE the log, in date order, touching nothing else.
    const again = applyEdit(next, logEditFor(next, 0, { date: "2026-09-12", values: { minutes: "40" } })!);
    assert.ok(again.includes("```routine-log\n2026-09-12 | minutes: 40\n2026-09-13 | done: morning\n```"));
    assert.equal(scanRoutines(again)[0].entries.length, 2);
  });
  it("answers null for a plan the note lacks and for a no-op patch", () => {
    assert.equal(logEditFor(NOTE, 3, { date: "2026-09-13", done: ["x"] }), null);
    assert.equal(logEditFor(NOTE, 0, { date: "2026-09-13" }), null);
  });
  it("rewrites only the plan's body", () => {
    const next = editRoutinePlan(NOTE, 0, "title: New\nitems: a\n");
    assert.equal(next, "# Fitness\n\n```routine\ntitle: New\nitems: a\n```\n\nSome prose.\n");
  });
});

describe("composing a plan", () => {
  it("round-trips a plan through the form's draft", () => {
    const plan = parseRoutine(PLAN)!;
    const body = routineFenceBody(draftOf(plan));
    const back = parseRoutine(body)!;
    assert.equal(back.title, plan.title);
    assert.deepEqual(back.week, plan.week);
    assert.deepEqual(back.fields, plan.fields);
    assert.equal(back.target, 6);
    assert.equal(back.notes, "Walk first.");
  });
  it("ships presets that parse, in both languages", () => {
    for (const p of ROUTINE_PRESETS) {
      for (const lang of ["en", "ar"] as const) {
        const plan = parseRoutine(routineFenceBody(p.draft(lang)));
        assert.ok(plan, `${p.id} ${lang}`);
        assert.equal(plan.kindKey, p.id);
      }
    }
  });
});

describe("a book in the plan (3.13.0)", () => {
  it("adds the reading task first and round-trips through the draft", () => {
    const plan = parseRoutine("title: Mornings\nbook: [[The Muqaddima|the book]]\nitems: coffee\n")!;
    assert.equal(plan.book, "The Muqaddima");
    assert.deepEqual(tasksFor(plan, "2026-09-14").map((t) => [t.key, t.book ?? false]), [["read", true], ["coffee", false]]);
    assert.ok(routineFenceBody(draftOf(plan)).includes("book: The Muqaddima"));
  });
});

describe("sigils (3.16.0; orbits in 3.15.0) — the new word, the same model", () => {
  const OWNER = `title: Daily exercise
kind: exercise
icon: 🚶
slots: morning, evening
target: 6/week
monday:
  morning: 60 min brisk walk
  evening: Full Body A: leg press 3×8–12, chest press 3×8–12, plank 3×45 sec
tuesday:
  morning: 60 min easy walk
`;
  it("reads a sigil fence, a 3.15 orbit fence and a routine fence as the same thing", () => {
    const sigil = scanRoutines("```sigil\n" + OWNER + "```\n\n```sigil-log\n2026-09-14 | done: morning\n```\n");
    const orbit = scanRoutines("```orbit\n" + OWNER + "```\n\n```orbit-log\n2026-09-14 | done: morning\n```\n");
    const legacy = scanRoutines("```routine\n" + OWNER + "```\n\n```routine-log\n2026-09-14 | done: morning\n```\n");
    assert.equal(sigil.length, 1);
    assert.equal(orbit.length, 1);
    assert.equal(legacy.length, 1);
    assert.deepEqual(sigil[0].plan, legacy[0].plan);
    assert.deepEqual(orbit[0].plan, legacy[0].plan);
    assert.deepEqual(sigil[0].entries, legacy[0].entries);
    assert.deepEqual(orbit[0].entries, legacy[0].entries);
  });
  it("keeps an icon and a banner, and the owner's plan round-trips untouched", () => {
    const plan = parseRoutine(OWNER)!;
    assert.equal(plan.emoji, "🚶");
    assert.equal(plan.fields.length, 0);
    // Opened in the form and saved with nothing changed: the same bytes.
    assert.equal(routineFenceBody(draftOf(plan)), OWNER);
    const withBanner = parseRoutine("title: X\nicon: ☪\nbanner: [[Media/walk.jpg]]\nitems: a\n")!;
    assert.equal(withBanner.emoji, "☪");
    assert.equal(withBanner.banner, "Media/walk.jpg");
    assert.ok(routineFenceBody(draftOf(withBanner)).includes("banner: Media/walk.jpg"));
    // A paragraph is not an icon.
    assert.equal(parseRoutine("title: X\nicon: not an icon at all\nitems: a\n")!.emoji, null);
  });
  it("spells a new log fence the way its plan is spelled", () => {
    const sigilNote = "```sigil\n" + OWNER + "```\n";
    const orbitNote = "```orbit\n" + OWNER + "```\n";
    const legacyNote = "```routine\n" + OWNER + "```\n";
    const patch = { date: "2026-09-14", done: ["morning"] };
    assert.ok(applyEdit(sigilNote, logEditFor(sigilNote, 0, patch)!).includes("```sigil-log\n"));
    assert.ok(applyEdit(orbitNote, logEditFor(orbitNote, 0, patch)!).includes("```orbit-log\n"));
    assert.ok(applyEdit(legacyNote, logEditFor(legacyNote, 0, patch)!).includes("```routine-log\n"));
  });
  it("knows a count, and lets a declared notes field claim its segment", () => {
    const plan = parseRoutine("title: Water\nfields: water:count:glasses, notes:text\nitems: drink\n")!;
    assert.deepEqual(plan.fields.map(fieldSpec), ["water:count:glasses", "notes:text"]);
    const entry = parseLogLine("2026-09-14 | done: drink | water: 6 | notes: felt fine", plan.fields)!;
    assert.equal(entry.values.water, "6");
    assert.equal(entry.values.notes, "felt fine");
    assert.equal(entry.note, null);
    // Without such a field the same segment is still the day's note.
    const bare = parseLogLine("2026-09-14 | notes: felt fine", [])!;
    assert.equal(bare.note, "felt fine");
  });
  it("files a new sigil under Sigils, or under the Routines folder a vault already keeps — never under Orbits", () => {
    assert.equal(routinesRootFor("en", []), "Sigils");
    assert.equal(routinesRootFor("ar", []), "سجل");
    assert.equal(routinesRootFor("en", ["Routines"]), "Routines");
    assert.equal(routinesRootFor("en", ["Routines", "Sigils"]), "Sigils");
    // Orbits/ is the decks' folder from 3.16: a 3.15 vault that filed its
    // sigils there gets a Sigils/ folder for the next one.
    assert.equal(routinesRootFor("en", ["Orbits"]), "Sigils");
    assert.equal(routinesRootFor("ar", ["مدارات"]), "سجل");
    assert.ok(routineNoteContent(draftOf(parseRoutine(OWNER)!)).startsWith('---\ntitle: "Daily exercise"\n---\n\n```sigil\n'));
  });
});

describe("pushed forward (3.16.3)", () => {
  const PLAN = `title: Walks
slots: morning, evening
monday:
  morning: walk
  evening: stretch
tuesday:
  morning: walk
  evening: stretch`;
  it("reads and writes deferred tasks and drops one once it is done or skipped", () => {
    const plan = parseRoutine(PLAN)!;
    const [e] = parseRoutineLog("2026-09-14 | done: morning | deferred: evening", plan.fields);
    assert.deepEqual(e.deferred, ["evening"]);
    assert.equal(formatLogLine(e, plan.fields), "2026-09-14 | done: morning | deferred: evening");
    const done = mergeEntry(e, { date: e.date, done: [...e.done, "evening"] });
    assert.deepEqual(done.deferred, [], "ticking the owed task takes it off the pushed list");
    assert.equal(dayStatus(plan, done, "2026-09-14", "2026-09-16"), "complete", "the day it was owed to gets the credit");
    const gaveUp = mergeEntry(e, { date: e.date, skipped: ["evening"] });
    assert.deepEqual(gaveUp.deferred, []);
  });
  it("carries a pushed task onto the following days until it is answered", () => {
    const plan = parseRoutine(PLAN)!;
    const entries = parseRoutineLog("2026-09-14 | done: morning | deferred: evening\n2026-09-15 | done: morning, evening", plan.fields);
    const carried = carriedTasks(plan, entries, "2026-09-16");
    assert.equal(carried.length, 1);
    assert.equal(carried[0].from, "2026-09-14");
    assert.equal(carried[0].task.key, "evening");
    assert.equal(carried[0].task.text, "stretch");
    assert.equal(carriedTasks(plan, entries, "2026-09-14").length, 0, "not on the day itself");
    assert.equal(carriedTasks(plan, entries, "2026-09-30").length, 0, "a week is the horizon");
  });
});
