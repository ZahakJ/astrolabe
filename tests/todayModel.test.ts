// Today's model (client/today/model.ts): what the day asks, as the rows both
// shells draw — the Sigil ticks, the tasks whose date has come, the decks
// with cards due, on this day, and when the evening's question is asked.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decksDue, dueTasks, onThisDayRows, reflectionState, sigilRows, toggledSigil } from "../client/today/model.ts";
import type { DeckMeta } from "../shared/decks.ts";
import { parseRoutine, parseRoutineLog } from "../shared/routine.ts";
import { parseTaskLine } from "../shared/tasks.ts";
import type { OnThisDayHit, RoutineMeta, TaskMeta } from "../shared/types.ts";

const TODAY = "2026-09-22"; // a Tuesday

function sigil(src: string, log = "", template = false): RoutineMeta {
  const plan = parseRoutine(src);
  assert.ok(plan !== null);
  return { path: "Sigils/Morning.md", index: 0, noteTitle: "Morning", plan, entries: parseRoutineLog(log, plan.fields), template, updatedMs: 0 };
}

function task(path: string, line: string, n = 1): TaskMeta {
  const parsed = parseTaskLine(line, n);
  assert.ok(parsed !== null);
  return { path, title: path.replace(/\.md$/, ""), tags: [], task: parsed };
}

describe("the Sigil rows", () => {
  it("lists what each sigil asks of today, ticked from today's log", () => {
    const rows = sigilRows([sigil("title: Morning\nitems: water, stretch", "2026-09-22 | done: water")], TODAY);
    assert.deepEqual(rows.map((r) => [r.task.key, r.done]), [["water", true], ["stretch", false]]);
  });

  it("leaves a template's sigil out", () => {
    assert.deepEqual(sigilRows([sigil("title: T\nitems: a", "", true)], TODAY), []);
  });

  it("marks a book's pages as answered on the card, not ticked in place", () => {
    const rows = sigilRows([sigil("title: Reading\nbook: Dune")], TODAY);
    assert.equal(rows[0].onCard, true);
  });

  it("computes a tick as the card's own edit: the day's done list, with the key added or taken out", () => {
    const [water, stretch] = sigilRows([sigil("title: Morning\nitems: water, stretch", "2026-09-22 | done: water")], TODAY);
    assert.deepEqual(toggledSigil(stretch, TODAY).done, ["water", "stretch"]);
    assert.deepEqual(toggledSigil(water, TODAY).done, []);
    const fresh = sigilRows([sigil("title: Morning\nitems: water")], TODAY)[0];
    const next = toggledSigil(fresh, TODAY);
    assert.deepEqual(next.done, ["water"]);
    assert.equal(next.meta.entries.at(-1)?.date, TODAY, "a day with no log line gets one");
  });
});

describe("the tasks due", () => {
  const rows = [
    task("Work.md", "- [ ] send the draft 📅 2026-09-22", 3),
    task("Work.md", "- [ ] reply to Sam 📅 2026-09-19", 4),
    task("Home.md", "- [ ] water plants 📅 2026-09-25", 1),
    task("Home.md", "- [x] done already 📅 2026-09-20 ✅ 2026-09-20", 2),
    task("Home.md", "- [ ] no date", 5),
    task("Home.md", "- [-] cancelled 📅 2026-09-10", 6),
  ];

  it("keeps what is due today and what is overdue — the Sigils page's own fence — oldest first", () => {
    const due = dueTasks(rows, TODAY);
    assert.deepEqual(due.map((r) => [r.task.text, r.overdue]), [["reply to Sam", true], ["send the draft", false]]);
  });
});

describe("the decks and on this day", () => {
  it("keeps the decks with cards due", () => {
    const deck = (path: string, due: number) => ({ path, counts: { total: 10, new: 0, due } }) as unknown as DeckMeta;
    assert.deepEqual(decksDue([deck("A.md", 0), deck("B.md", 3)]).map((d) => d.path), ["B.md"]);
  });

  it("puts the newest year first", () => {
    const hit = (year: number, path: string): OnThisDayHit => ({ path, title: path, year, kind: "written", what: path, excerpt: "" });
    assert.deepEqual(onThisDayRows([hit(2020, "a"), hit(2024, "b"), hit(2022, "c")]).map((h) => h.year), [2024, 2022, 2020]);
  });
});

describe("the evening's question", () => {
  const morning = new Date(2026, 8, 22, 9, 0);
  const evening = new Date(2026, 8, 22, 19, 30);

  it("is not asked before six", () => {
    assert.deepEqual(reflectionState("# Tuesday\n", morning), { kind: "hidden" });
    assert.deepEqual(reflectionState(null, morning), { kind: "hidden" });
  });

  it("is asked from six, also of a day with no note yet, and of a template's empty section", () => {
    assert.deepEqual(reflectionState(null, evening), { kind: "ask" });
    assert.deepEqual(reflectionState("## Reflection\n\n## Tomorrow\n", evening), { kind: "ask" });
  });

  it("is answered once something is under `## Reflection`, whatever the hour", () => {
    assert.deepEqual(reflectionState("## Reflection\n\nA good day.\n", morning), { kind: "done", text: "A good day." });
    assert.deepEqual(reflectionState("## Reflection\n\nA good day.\n", evening), { kind: "done", text: "A good day." });
  });
});
