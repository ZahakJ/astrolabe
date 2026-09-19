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
import {
  courseBands,
  courseCursor,
  courseFinish,
  courseProgress,
  courseRemaining,
  courseStepsOn,
  projectCourse,
} from "../shared/course.ts";
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

// ── A course (3.19.0) ───────────────────────────────────────────────────────
//
// The second mode of the same fence: an ordered list of steps, nothing in the
// note dated, every date PROJECTED from the cursor forward. The tests below
// hold the four things that can quietly go wrong — the note's bytes, a step's
// name, where the cursor is, and what a missed day does to the schedule.

describe("a course", () => {
  const COURSE = `title: Japanese
kind: study
icon: 🗻
mode: course
days: mon, tue, wed, thu, fri, sat
capacity: 15 min · sat 45 min · sun 0
items: [[Orbits/Japanese/Hiragana]] · [[Orbits/Japanese/Katakana]]
steps: |
  # Kana
  - Tofugu Learn Hiragana rows あ か さ た (45 min)
  - rows な は ま や ら わ ん (45 min)

  # Genki I — lesson 1
  - grammar point 1, then Tae Kim's telling of it (15 min)
  - grammar point 2 (15 min)
  - grammar point 3 (15 min)
notes: |
  Left hand, on the sheets.
`;
  const plan = () => parseRoutine(COURSE)!;

  it("reads the mode, the days, the capacity, the items and the steps", () => {
    const p = plan();
    assert.equal(p.mode, "course");
    assert.ok(p.course);
    assert.deepEqual(p.course.days, ["mon", "tue", "wed", "thu", "fri", "sat"]);
    assert.equal(p.course.capacity, 15);
    assert.deepEqual(p.course.capacityByDay, { sat: 45, sun: 0 });
    // The middle dot joins a list as a comma does.
    assert.deepEqual(p.items, ["[[Orbits/Japanese/Hiragana]]", "[[Orbits/Japanese/Katakana]]"]);
    assert.equal(p.course.steps.length, 5);
    assert.deepEqual(
      p.course.steps.map((s) => [s.unit, s.text, s.minutes]),
      [
        ["Kana", "Tofugu Learn Hiragana rows あ か さ た", 45],
        ["Kana", "rows な は ま や ら わ ん", 45],
        ["Genki I — lesson 1", "grammar point 1, then Tae Kim's telling of it", 15],
        ["Genki I — lesson 1", "grammar point 2", 15],
        ["Genki I — lesson 1", "grammar point 3", 15],
      ],
    );
    // A weekly sigil is untouched by any of it.
    const weekly = parseRoutine(PLAN)!;
    assert.equal(weekly.mode, "week");
    assert.equal(weekly.course, null);
  });

  it("round-trips through the form's draft byte for byte, comments and blank lines and all", () => {
    const withComment = COURSE.replace("  # Kana\n", "  # Kana\n  # two weeks, no more\n\n");
    for (const src of [COURSE, withComment]) {
      const p = parseRoutine(src)!;
      assert.equal(routineFenceBody(draftOf(p)), src);
    }
  });

  it("names a step by its tag, else by a hash that survives an insert and a reorder", () => {
    const keys = plan().course!.steps.map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length, "no two steps share a name");
    assert.ok(keys.every((k) => /^k[0-9a-z]{6}$/.test(k)));
    // Insert a step at the top and reorder two others: every other key holds.
    const moved = parseRoutine(
      COURSE.replace("  - Tofugu Learn Hiragana", "  - a new first step (5 min)\n  - Tofugu Learn Hiragana").replace(
        "  - grammar point 2 (15 min)\n  - grammar point 3 (15 min)",
        "  - grammar point 3 (15 min)\n  - grammar point 2 (15 min)",
      ),
    )!;
    for (const key of keys) assert.ok(moved.course!.steps.some((s) => s.key === key), key);
    // An explicit tag wins, and is what the reader sees in the log.
    const tagged = parseRoutine(COURSE.replace("  - grammar point 2 (15 min)", "  - grammar point 2 (15 min) [g2]"))!;
    const g2 = tagged.course!.steps.find((s) => s.text === "grammar point 2")!;
    assert.equal(g2.key, "g2");
    assert.equal(g2.tagged, true);
    assert.equal(g2.minutes, 15);
    // A wikilink at the end of a step is not a tag.
    const link = parseRoutine("title: x\nmode: course\nsteps: |\n  - study [[Orbits/Hiragana]]\n")!;
    assert.equal(link.course!.steps[0].tagged, false);
    assert.equal(link.course!.steps[0].text, "study [[Orbits/Hiragana]]");
    // Two steps that say the same words under the same heading are told apart.
    const twice = parseRoutine("title: x\nmode: course\nsteps: |\n  # U\n  - review\n  - review\n")!;
    assert.notEqual(twice.course!.steps[0].key, twice.course!.steps[1].key);
  });

  it("stamps a step's key into the note the first time it is ticked, so the words can change after", () => {
    const note = "# J\n\n```sigil\n" + COURSE + "```\n";
    const first = plan().course!.steps[0];
    const edit = logEditFor(note, 0, { date: "2026-09-21", done: [first.key] })!;
    const next = applyEdit(note, edit);
    assert.ok(next.includes(`- Tofugu Learn Hiragana rows あ か さ た (45 min) [${first.key}]`), "the step signs its line");
    assert.ok(next.includes("```sigil-log\n2026-09-21 | done: " + first.key + "\n```"), "and the log records it");
    // Every other byte of the plan is where it was.
    assert.ok(next.includes("capacity: 15 min · sat 45 min · sun 0\n"));
    assert.ok(next.includes("  # Genki I — lesson 1\n"));
    // Now rewrite the step's words: the tick stays on it.
    const edited = next.replace("Tofugu Learn Hiragana rows あ か さ た", "Tofugu — hiragana, the first four rows");
    const blocks = scanRoutines(edited);
    assert.equal(blocks[0].plan.course!.steps[0].key, first.key);
    assert.equal(courseProgress(blocks[0].plan, blocks[0].entries).done, 1);
    // A second tick on an already-stamped step touches the log alone.
    const again = applyEdit(edited, logEditFor(edited, 0, { date: "2026-09-22", done: [blocks[0].plan.course!.steps[1].key] })!);
    assert.equal(again.split("```sigil\n")[1].split("```")[0].includes("[k"), true);
    assert.equal(scanRoutines(again)[0].entries.length, 2);
  });

  it("puts the cursor on the first step neither done nor skipped", () => {
    const p = plan();
    const keys = p.course!.steps.map((s) => s.key);
    assert.equal(courseCursor(p, [])!.key, keys[0]);
    const log = parseRoutineLog(`2026-09-19 | done: ${keys[0]}\n2026-09-20 | skipped: ${keys[1]}\n`, p.fields);
    assert.equal(courseCursor(p, log)!.key, keys[2], "a skipped step moves the cursor on");
    assert.deepEqual(courseProgress(p, log), { done: 2, of: 5 });
    // A step ticked out of turn is simply gone from what is left.
    const jumped = parseRoutineLog(`2026-09-19 | done: ${keys[3]}\n`, p.fields);
    assert.deepEqual(courseRemaining(p, jumped).map((s) => s.key), [keys[0], keys[1], keys[2], keys[4]]);
    assert.equal(courseCursor(p, []) !== null, true);
    assert.equal(courseCursor(p, parseRoutineLog(keys.map((k, i) => `2026-09-${20 + i} | done: ${k}`).join("\n"), p.fields)), null);
  });

  it("projects the steps over the allowed days, packing each day by its capacity", () => {
    const p = plan();
    const keys = p.course!.steps.map((s) => s.key);
    // Saturday 2026-09-19: 45 minutes, so one 45-minute step. Sunday is a
    // rest day (capacity 0). Monday 15 min: one step. …
    const days = projectCourse(p, [], "2026-09-19");
    assert.deepEqual(
      days.map((d) => [d.iso, d.steps.map((s) => s.key)]),
      [
        ["2026-09-19", [keys[0]]],
        ["2026-09-21", [keys[1]]],
        ["2026-09-22", [keys[2]]],
        ["2026-09-23", [keys[3]]],
        ["2026-09-24", [keys[4]]],
      ],
    );
    assert.equal(courseFinish(p, [], "2026-09-19"), "2026-09-24");
    // Saturday's 45 minutes hold three fifteen-minute steps at once.
    const short = parseRoutine("title: x\nmode: course\ncapacity: 45 min\nsteps: |\n  - a (15 min)\n  - b (15 min)\n  - c (15 min)\n  - d (15 min)\n")!;
    assert.deepEqual(projectCourse(short, [], "2026-09-21").map((d) => d.steps.length), [3, 1]);
    // Without a capacity a day takes exactly one step.
    const bare = parseRoutine("title: x\nmode: course\nsteps: |\n  - a\n  - b\n")!;
    assert.deepEqual(projectCourse(bare, [], "2026-09-21").map((d) => [d.iso, d.steps.length]), [["2026-09-21", 1], ["2026-09-22", 1]]);
  });

  it("shifts everything when a day is missed, and changes nothing in the note to do it", () => {
    const p = plan();
    const keys = p.course!.steps.map((s) => s.key);
    // Saturday's step was done; nothing since. On Monday the rest simply
    // starts on Monday — the note is the same note.
    const log = parseRoutineLog(`2026-09-19 | done: ${keys[0]}\n`, p.fields);
    const onMon = projectCourse(p, log, "2026-09-21").map((d) => d.iso);
    assert.deepEqual(onMon, ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"]);
    // Two days missed: the same four steps, two days later, nothing lost.
    const onWed = projectCourse(p, log, "2026-09-23");
    assert.deepEqual(onWed.map((d) => d.steps[0].key), [keys[1], keys[2], keys[3], keys[4]]);
    assert.equal(courseFinish(p, log, "2026-09-23"), "2026-09-26");
  });

  it("judges a day by its capacity's worth of steps, and calls the rest days rest", () => {
    const p = plan();
    const keys = p.course!.steps.map((s) => s.key);
    const today = "2026-09-24"; // a Thursday
    // Sunday asks nothing: capacity 0 and not in `days`. The every-day items
    // still are asked, so the day is not rest — untick them and it is.
    const noItems = parseRoutine(COURSE.replace(/items:.*\n/, ""))!;
    assert.equal(dayStatus(noItems, null, "2026-09-20", today), "rest");
    // A Monday with the day's fifteen minutes done is complete…
    const items = p.items;
    const full = { date: "2026-09-21", done: [keys[2], ...items], skipped: [], deferred: [], values: {}, note: null };
    assert.equal(dayStatus(p, full, "2026-09-21", today), "complete");
    // …the same Monday with only the items is partial…
    assert.equal(dayStatus(p, { ...full, done: [...items] }, "2026-09-21", today), "partial");
    // …and a Monday with nothing at all, behind us, is missed.
    assert.equal(dayStatus(p, null, "2026-09-21", today), "missed");
    // Saturday wants forty-five minutes: one fifteen-minute step is not a day.
    const sat = { date: "2026-09-19", done: [keys[2], ...items], skipped: [], deferred: [], values: {}, note: null };
    assert.equal(dayStatus(p, sat, "2026-09-19", today), "partial");
    assert.equal(dayStatus(p, { ...sat, done: [keys[0], ...items] }, "2026-09-19", today), "complete");
    // A course with no capacity is done on one step.
    const bare = parseRoutine("title: x\nmode: course\nsteps: |\n  - a\n  - b\n")!;
    const k = bare.course!.steps[0].key;
    assert.equal(dayStatus(bare, { date: "2026-09-21", done: [k], skipped: [], deferred: [], values: {}, note: null }, "2026-09-21", today), "complete");
  });

  it("shows a day the steps it holds and the ones projected onto it, and reads unit bands", () => {
    const p = plan();
    const keys = p.course!.steps.map((s) => s.key);
    const log = parseRoutineLog(`2026-09-19 | done: ${keys[0]}\n`, p.fields);
    // The day it was done still shows it, so the tick can be taken back.
    assert.deepEqual(courseStepsOn(p, log, "2026-09-19", "2026-09-21").map((s) => s.key), [keys[0]]);
    assert.deepEqual(courseStepsOn(p, log, "2026-09-21", "2026-09-21").map((s) => s.key), [keys[1]]);
    const bands = courseBands(projectCourse(p, [], "2026-09-19"));
    assert.deepEqual(bands.map((b) => [b.unit, b.start, b.end, b.steps]), [
      ["Kana", "2026-09-19", "2026-09-21", 2],
      ["Genki I — lesson 1", "2026-09-22", "2026-09-24", 3],
    ]);
  });

  it("leaves the weekly fixtures exactly as they were", () => {
    // The owner's own sigil, through the same code path, unchanged.
    const weekly = parseRoutine(PLAN)!;
    assert.equal(weekly.mode, "week");
    assert.deepEqual(tasksFor(weekly, "2026-09-14").map((t) => t.key), ["morning", "evening"]);
    assert.equal(routineFenceBody(draftOf(weekly)), PLAN);
    const note = `\`\`\`routine\n${PLAN}\`\`\`\n`;
    assert.equal(applyEdit(note, logEditFor(note, 0, { date: "2026-09-14", done: ["morning"] })!), `\`\`\`routine\n${PLAN}\`\`\`\n\n\`\`\`routine-log\n2026-09-14 | done: morning\n\`\`\`\n`);
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
