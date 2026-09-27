// The settings purge and its second pass, held to their ledger.
//
// contracts/settings-audit.md lists the 110 rows the settings index held
// before the purge, each with a verdict (keep, move, merge, demote) and — since
// the second pass broke the nine sections into eighteen pages — the page it
// landed on. This test reads that table as the OLD INDEX and holds the new one
// to it: every old row still exists — as a row, or as a part folded into
// another row — by its label key, unless the audit says REMOVE or ENV-ONLY;
// and each sits exactly where the *Page (round 2)* column says: that page,
// behind that page's Advanced line or not, a part of that host or not. Move a
// row without editing the ledger and this test says which.

import "../client/i18n/both.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SETTINGS_INDEX } from "../client/components/settings/settingsIndex.ts";
import { GROUPS, POCKET_HIDDEN_TABS, sectionId, TABS } from "../client/components/settings/tabs.ts";

const audit = readFileSync(new URL("../contracts/settings-audit.md", import.meta.url), "utf8");
const VERDICTS = ["KEEP", "MOVE", "MERGE", "DEMOTE", "ENV-ONLY", "REMOVE"] as const;
type Verdict = (typeof VERDICTS)[number];
interface OldRow {
  n: number;
  tab: string;
  label: string;
  verdict: Verdict;
  /** The Page (round 2) cell: "`page`", "`page` › Advanced", "`page`, part of `host`". */
  page: string;
}
const rows: OldRow[] = [...audit.matchAll(/^\| (\d+) \| ([a-z]+) \| `([A-Za-z0-9_]+)` \|.*\| (KEEP|MOVE|MERGE|DEMOTE|ENV-ONLY|REMOVE) \|[^|]*\| ([^|]*) \|$/gm)].map((m) => ({
  n: Number(m[1]),
  tab: m[2],
  label: m[3],
  verdict: m[4] as Verdict,
  page: m[5].trim(),
}));
const byLabel = new Map(SETTINGS_INDEX.map((e) => [e.label as string, e]));

describe("the settings purge's audit", () => {
  it("lists all 110 rows of the old index, numbered, once each", () => {
    assert.equal(rows.length, 110);
    assert.deepEqual(rows.map((r) => r.n), Array.from({ length: 110 }, (_, i) => i + 1));
    assert.equal(new Set(rows.map((r) => r.label)).size, 110);
    const perTab: Record<string, number> = {};
    for (const r of rows) perTab[r.tab] = (perTab[r.tab] ?? 0) + 1;
    assert.deepEqual(perTab, { device: 18, site: 11, language: 15, publishing: 16, collections: 11, vault: 18, sync: 14, ask: 7 });
  });

  it("counts its verdicts the way its own table says", () => {
    const counted = Object.fromEntries(VERDICTS.map((v) => [v, rows.filter((r) => r.verdict === v).length]));
    for (const v of VERDICTS) {
      const stated = new RegExp(`^\\| ${v} \\| (\\d+) \\|$`, "m").exec(audit);
      assert.ok(stated, `the audit states no count for ${v}`);
      assert.equal(Number(stated[1]), counted[v], `${v}: the table says ${stated[1]}, the rows say ${counted[v]}`);
    }
  });
});

describe("the new index against the ledger", () => {
  it("keeps every row the audit did not remove, by its label key", () => {
    const gone = rows.filter((r) => r.verdict !== "REMOVE" && r.verdict !== "ENV-ONLY" && !byLabel.has(r.label));
    assert.deepEqual(gone.map((r) => r.label), [], "rows the audit kept that are no longer in the index");
  });

  it("drops every row the audit removed or sent to .env", () => {
    const stayed = rows.filter((r) => (r.verdict === "REMOVE" || r.verdict === "ENV-ONLY") && byLabel.has(r.label));
    assert.deepEqual(stayed.map((r) => r.label), []);
  });

  it("folds each MERGE into another row as a part", () => {
    for (const r of rows.filter((x) => x.verdict === "MERGE")) {
      assert.ok(byLabel.get(r.label)?.row !== undefined, `${r.label} was merged but is still a row of its own`);
    }
  });

  it("puts every row on the page the second pass gave it — Advanced and host included", () => {
    for (const r of rows.filter((x) => x.verdict !== "REMOVE" && x.verdict !== "ENV-ONLY")) {
      const e = byLabel.get(r.label);
      const m = /^`([a-z]+)`(?:, part of `([A-Za-z0-9_]+)`)?( › Advanced)?$/.exec(r.page);
      assert.ok(m, `${r.label}: the Page (round 2) cell "${r.page}" is not "\`page\`[, part of \`host\`][ › Advanced]"`);
      assert.equal(e?.tab, m[1], `${r.label} is on ${e?.tab}, the ledger says ${m[1]}`);
      assert.equal(e?.row, m[2], `${r.label}'s host is ${e?.row}, the ledger says ${m[2]}`);
      assert.equal(e?.adv === true, m[3] !== undefined, `${r.label} and the ledger disagree about Advanced`);
    }
  });

  it("adds nothing the ledger does not account for — every new entry is in its additions table, where it says", () => {
    const old = new Set(rows.map((r) => r.label));
    const additions = audit.slice(audit.indexOf("## Round 2 additions"), audit.indexOf("## The verdicts, counted"));
    const listed = [...additions.matchAll(/^\| `([A-Za-z0-9_]+)` \| ([^|]+) \|/gm)].map((m) => ({ label: m[1], page: m[2].trim() }));
    const added = SETTINGS_INDEX.filter((e) => !old.has(e.label)).map((e) => e.label);
    assert.deepEqual(added.sort(), listed.map((l) => l.label).sort());
    for (const l of listed) {
      const e = byLabel.get(l.label);
      const m = /^`([a-z]+)`(?:, part of `([A-Za-z0-9_]+)`)?$/.exec(l.page);
      assert.ok(m && e?.tab === m[1] && e?.row === m[2], `${l.label} is not where the additions table says (${l.page})`);
    }
  });
});

describe("the pages", () => {
  it("are eighteen short pages in four groups, each group's pages together in the rail", () => {
    assert.equal(TABS.length, 18);
    assert.deepEqual(GROUPS.map((g) => g.id), ["you", "site", "data", "app"]);
    const order = TABS.map((s) => GROUPS.findIndex((g) => g.id === s.group));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), "a group's pages are split across the rail");
    for (const e of SETTINGS_INDEX) assert.equal(e.group, TABS.find((s) => s.id === e.tab)?.group, `${e.label}'s group is not its page's`);
  });

  it("open with the rows a first-day reader comes for", () => {
    const firstRow = (tab: string): string | undefined => SETTINGS_INDEX.find((e) => e.tab === tab && e.row === undefined)?.label;
    assert.equal(firstRow("appearance"), "rowYourTheme");
    assert.equal(firstRow("language"), "rowEditorLanguage");
    assert.equal(firstRow("site"), "rowSiteName");
    assert.equal(firstRow("publishing"), "rowPublicLayout");
    assert.equal(firstRow("sync"), "rowSyncEnabled");
  });

  it("send every former id to a page that holds its rows", () => {
    // The purge's nine are all still pages…
    for (const id of ["appearance", "language", "writing", "reading", "site", "collections", "sync", "ask", "about"]) assert.equal(sectionId(id), id);
    // …and of the three before them, two are pages again and one moved on.
    assert.equal(sectionId("device"), "device");
    assert.equal(sectionId("publishing"), "publishing");
    assert.equal(sectionId("vault"), "notes");
    assert.equal(sectionId("nonsense"), "");
  });

  it("keep a pocket vault out of the pages it cannot keep, and index them for an instance only", () => {
    for (const id of POCKET_HIDDEN_TABS) {
      assert.ok(TABS.some((s) => s.id === id), `${id} is not a page`);
      assert.ok(SETTINGS_INDEX.filter((e) => e.tab === id).every((e) => e.mode === "instance"), `${id} has a row a pocket would be offered`);
    }
  });
});
