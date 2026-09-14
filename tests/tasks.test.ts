// Tasks (shared/tasks.ts): the plugin's grammar, the one-line toggle, the
// fence's filters.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterTasks, parseTaskLine, parseTasksFence, scanTasks, toggleTaskLine } from "../shared/tasks.ts";

describe("a task line", () => {
  it("reads the box, the text and the plugin's fields", () => {
    const t = parseTaskLine("  - [ ] Read ch. 3 #reading 📅 2026-09-20 ⏳ 2026-09-18 ⏫ 🔁 every week", 4)!;
    assert.equal(t.text, "Read ch. 3 #reading");
    assert.equal(t.done, false);
    assert.equal(t.due, "2026-09-20");
    assert.equal(t.scheduled, "2026-09-18");
    assert.equal(t.priority, "high");
    assert.equal(t.recurrence, "every week");
    assert.deepEqual(t.tags, ["reading"]);
    assert.equal(t.indent, 2);
    assert.equal(t.line, 4);
  });
  it("reads done, cancelled and the completion stamp; ignores non-tasks", () => {
    assert.equal(parseTaskLine("- [x] done ✅ 2026-09-01", 1)!.completed, "2026-09-01");
    assert.equal(parseTaskLine("- [-] dropped", 1)!.cancelled, true);
    assert.equal(parseTaskLine("- plain bullet", 1), null);
    assert.equal(parseTaskLine("[ ] no bullet", 1), null);
  });
  it("scans a note, skipping fences, with full-source lines", () => {
    const md = "---\nx: 1\n---\n- [ ] one\n```\n- [ ] not a task\n```\n1. [x] two\n";
    assert.deepEqual(scanTasks(md).map((t) => [t.line, t.text, t.done]), [[4, "one", false], [8, "two", true]]);
  });
  it("toggles one line, stamping and unstamping ✅, keeping the fields", () => {
    const line = "- [ ] Read ch. 3 📅 2026-09-20";
    const done = toggleTaskLine(line, true, "2026-09-13");
    assert.equal(done, "- [x] Read ch. 3 📅 2026-09-20 ✅ 2026-09-13");
    assert.equal(toggleTaskLine(done, false, "2026-09-14"), "- [ ] Read ch. 3 📅 2026-09-20");
    assert.equal(toggleTaskLine("  * [X] a ✅ 2026-01-01", false, "x"), "  * [ ] a");
  });
});

describe("a tasks fence", () => {
  const rows = [
    { path: "A.md", tags: ["work"], task: parseTaskLine("- [ ] a 📅 2026-09-14 🔽", 1)! },
    { path: "B.md", tags: [], task: parseTaskLine("- [ ] b 📅 2026-09-10 ⏫", 1)! },
    { path: "C.md", tags: [], task: parseTaskLine("- [x] c 📅 2026-09-12 ✅ 2026-09-12", 1)! },
    { path: "D.md", tags: [], task: parseTaskLine("- [ ] d", 1)! },
  ];
  it("defaults to open tasks, soonest due first, undated last", () => {
    const spec = parseTasksFence("", "2026-09-13");
    assert.deepEqual(filterTasks(rows, spec).map((r) => r.path), ["B.md", "A.md", "D.md"]);
  });
  it("understands the plugin's phrases", () => {
    assert.deepEqual(filterTasks(rows, parseTasksFence("overdue", "2026-09-13")).map((r) => r.path), ["B.md"]);
    assert.deepEqual(filterTasks(rows, parseTasksFence("due this week", "2026-09-13")).map((r) => r.path), ["B.md"]);
    assert.deepEqual(filterTasks(rows, parseTasksFence("done", "2026-09-13")).map((r) => r.path), ["C.md"]);
    assert.deepEqual(filterTasks(rows, parseTasksFence("tag:work", "2026-09-13")).map((r) => r.path), ["A.md"]);
    assert.deepEqual(filterTasks(rows, parseTasksFence("all\nsort: priority\nlimit: 2", "2026-09-13")).map((r) => r.path), ["B.md", "C.md"]);
  });
});
