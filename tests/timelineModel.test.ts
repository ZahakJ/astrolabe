// The Timeline's model (client/timeline/model.ts): the Calendar's day
// aggregation (shared/dayAgenda.ts) read out as items, filtered by chips,
// grouped month → day into rows with fixed heights, and windowed for a
// virtual list.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agendaByDay, agendaDays, type AgendaNoteSource, type AgendaSources } from "../shared/dayAgenda.ts";
import { parseRoutine, parseRoutineLog } from "../shared/routine.ts";
import {
  countBy,
  filterItems,
  itemsOf,
  kindCounts,
  layoutOf,
  monthAt,
  monthsOf,
  NO_FILTER,
  ROW_HEIGHT,
  rowsOf,
  visibleRange,
} from "../client/timeline/model.ts";

const TODAY = "2026-09-23";

function note(path: string, day: string | null, extra: Partial<AgendaNoteSource> = {}): AgendaNoteSource {
  const title = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  return { path, title, day, publishedDay: null, published: false, excerpt: `${title}…`, tags: [], captured: 0, voice: 0, ...extra };
}

const plan = parseRoutine("title: Morning\nitems: water")!;
const SOURCES: AgendaSources = {
  notes: new Map([
    ["2026-09-22", "Daily/2026-09-22.md"],
    ["2026-08-30", "Daily/2026-08-30.md"],
  ]),
  sigils: [{ path: "Sigils/Morning.md", index: 0, plan, entries: parseRoutineLog("2026-09-22 | done: water\n2026-08-29 | done: water", plan.fields) }],
  trackers: [{ path: "Books/Dune.md", index: 0, title: "Dune", sessions: [{ date: "2026-09-21", from: null, to: null, pages: 12, minutes: 30 }] }],
  grades: [],
  written: [
    note("Essays/On reading.md", "2026-09-22", { tags: ["reading"] }),
    note("Daily/2026-09-22.md", "2026-09-22", { captured: 2, excerpt: "A quiet Tuesday" }),
    note("Inbox/Voice — a walk.md", "2026-08-30", { voice: 1 }),
    note("Posts/Launch.md", "2026-08-01", { published: true, publishedDay: "2026-09-21", tags: ["site"] }),
  ],
};

function build() {
  const days = agendaDays(SOURCES, TODAY);
  const agenda = agendaByDay(days, SOURCES, TODAY, { project: false });
  const tags = new Map((SOURCES.written ?? []).map((n) => [n.path, n.tags]));
  return itemsOf(days, agenda, (p) => tags.get(p) ?? []);
}

describe("the items", () => {
  const items = build();

  it("lists every kind the vault by date holds, newest day first, the day's own note leading its day", () => {
    assert.deepEqual(
      items.map((i) => [i.iso, i.kind, i.title]),
      [
        ["2026-09-22", "daily", "2026-09-22"],
        ["2026-09-22", "note", "On reading"],
        ["2026-09-22", "capture", "2026-09-22"],
        ["2026-09-22", "sigil", "Morning"],
        ["2026-09-21", "published", "Launch"],
        ["2026-09-21", "session", "Dune"],
        ["2026-08-30", "daily", "2026-08-30"],
        ["2026-08-30", "voice", "Voice — a walk"],
        ["2026-08-29", "sigil", "Morning"],
        ["2026-08-01", "note", "Launch"],
      ],
    );
  });

  it("carries the calendar's excerpt for a daily note and each note's own for the rest", () => {
    assert.deepEqual(items[0].detail, { kind: "excerpt", text: "A quiet Tuesday" });
    assert.deepEqual(items[2].detail, { kind: "catch", lines: 2, voice: 0 });
    assert.deepEqual(items[5].detail, { kind: "session", pages: 12, minutes: 30, sessions: 1 });
  });

  it("gives every item a unique key", () => {
    assert.equal(new Set(items.map((i) => i.key)).size, items.length);
  });
});

describe("the chips", () => {
  const items = build();

  it("filters by kind, by folder and by tag, and all three at once", () => {
    assert.deepEqual(filterItems(items, { ...NO_FILTER, kinds: new Set(["sigil"]) }).map((i) => i.iso), ["2026-09-22", "2026-08-29"]);
    assert.deepEqual(filterItems(items, { ...NO_FILTER, folder: "Posts" }).map((i) => i.kind), ["published", "note"]);
    assert.deepEqual(filterItems(items, { ...NO_FILTER, tag: "READING" }).map((i) => i.title), ["On reading"]);
    assert.deepEqual(filterItems(items, { kinds: new Set(["note"]), folder: "Posts", tag: "site" }).map((i) => i.iso), ["2026-08-01"]);
  });

  it("counts each chip's choices, most first", () => {
    assert.equal(kindCounts(items).get("daily"), 2);
    assert.deepEqual(countBy(items, (i) => [i.folder])[0], { value: "Daily", count: 3 });
  });
});

describe("the rows and the virtual list", () => {
  const rows = rowsOf(build());
  const layout = layoutOf(rows);

  it("groups by month, then day, each header once", () => {
    const headers = rows.filter((r) => r.type !== "item").map((r) => (r.type === "month" ? `M ${r.ym} ${r.count}` : r.type === "day" ? `D ${r.iso}` : ""));
    assert.deepEqual(headers, ["M 2026-09 6", "D 2026-09-22", "D 2026-09-21", "M 2026-08 4", "D 2026-08-30", "D 2026-08-29", "D 2026-08-01"]);
  });

  it("places every row by the fixed heights, so a jump is a lookup", () => {
    assert.equal(layout.tops[0], 0);
    assert.equal(layout.tops[1], ROW_HEIGHT.month);
    assert.equal(layout.tops[2], ROW_HEIGHT.month + ROW_HEIGHT.day);
    const total = rows.reduce((y, r) => y + ROW_HEIGHT[r.type], 0);
    assert.equal(layout.total, total);
    const months = monthsOf(rows, layout);
    assert.deepEqual(months.map((m) => m.ym), ["2026-09", "2026-08"]);
    assert.equal(monthAt(months, months[1].top + 5), "2026-08");
    assert.equal(monthAt(months, 0), "2026-09");
  });

  it("mounts only what a viewport and its overscan reach, however long the list", () => {
    // Ten thousand days, one note each: the list a big vault is.
    const many = Array.from({ length: 10_000 }, (_, i) => {
      const d = new Date(Date.UTC(2000, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      return { key: `n:${d}`, kind: "note" as const, iso: d, path: `N/${d}.md`, index: null, title: d, detail: { kind: "excerpt" as const, text: "" }, folder: "N", tags: [] };
    }).reverse();
    const bigRows = rowsOf(many);
    const big = layoutOf(bigRows);
    const [first, last] = visibleRange(big, 400_000, 900, 400);
    assert.ok(last - first < 40, `mounted ${last - first} rows`);
    assert.ok(big.tops[first] <= 400_000 - 400 && big.tops[last - 1] < 400_000 + 900 + 400);
    assert.deepEqual(visibleRange(layoutOf([]), 0, 900), [0, 0]);
  });
});
