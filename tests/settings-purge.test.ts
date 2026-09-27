// The settings purge, held to its own audit.
//
// scratchpad/settings-purge/audit.md (tracked, though the scratchpad is not)
// lists the 110 rows the settings index held before the purge, each with a
// verdict. This test reads that table as the OLD INDEX and holds the new one
// to it: every old row still exists — as a row, or as a part folded into
// another row — by its label key, unless the audit says REMOVE or ENV-ONLY;
// a MERGE is a part, a DEMOTE is behind its section's Advanced line. Change a
// verdict in the audit and this test follows it; move a row without one and
// this test says which.

import "../client/i18n/both.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SETTINGS_INDEX } from "../client/components/settings/settingsIndex.ts";
import { POCKET_HIDDEN_TABS, sectionId, TABS } from "../client/components/settings/tabs.ts";

const audit = readFileSync(new URL("../scratchpad/settings-purge/audit.md", import.meta.url), "utf8");
const VERDICTS = ["KEEP", "MOVE", "MERGE", "DEMOTE", "ENV-ONLY", "REMOVE"] as const;
type Verdict = (typeof VERDICTS)[number];
interface OldRow {
  n: number;
  tab: string;
  label: string;
  verdict: Verdict;
}
const rows: OldRow[] = [...audit.matchAll(/^\| (\d+) \| ([a-z]+) \| `([A-Za-z0-9_]+)` \|.*\| (KEEP|MOVE|MERGE|DEMOTE|ENV-ONLY|REMOVE) \|[^|]*\|$/gm)].map((m) => ({
  n: Number(m[1]),
  tab: m[2],
  label: m[3],
  verdict: m[4] as Verdict,
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

describe("the new index against the old one", () => {
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

  it("puts each DEMOTE behind its section's Advanced line", () => {
    for (const r of rows.filter((x) => x.verdict === "DEMOTE")) {
      assert.equal(byLabel.get(r.label)?.adv, true, `${r.label} was demoted but is in sight`);
    }
  });

  it("leaves a KEEP in the section its old tab became", () => {
    for (const r of rows.filter((x) => x.verdict === "KEEP")) {
      const now = byLabel.get(r.label)?.tab;
      assert.ok(now === r.tab || now === sectionId(r.tab), `${r.label} was kept but moved from ${r.tab} to ${now}`);
    }
  });

  it("adds nothing the audit does not account for, beyond the one new host row", () => {
    const old = new Set(rows.map((r) => r.label));
    const added = SETTINGS_INDEX.filter((e) => !old.has(e.label)).map((e) => e.label);
    assert.deepEqual(added, ["rowWebmentions"]);
  });
});

describe("the sections", () => {
  it("are nine or fewer, and the first-day four open sections of their own", () => {
    assert.ok(TABS.length <= 9);
    const firstRow = (tab: string): string | undefined => SETTINGS_INDEX.find((e) => e.tab === tab && e.row === undefined)?.label;
    assert.equal(firstRow("appearance"), "rowYourTheme");
    assert.equal(firstRow("language"), "rowEditorLanguage");
    assert.equal(firstRow("site"), "rowSiteName");
    assert.equal(firstRow("sync"), "rowSyncEnabled");
    assert.ok(SETTINGS_INDEX.find((e) => e.label === "rowPublicLayout")?.tab === "site");
  });

  it("name no tab after an implementation", () => {
    for (const id of ["device", "vault", "publishing"]) assert.ok(!TABS.some((s) => s.id === id), `${id} is still a section`);
  });

  it("send a former id to the section that holds its rows", () => {
    assert.equal(sectionId("device"), "appearance");
    assert.equal(sectionId("vault"), "writing");
    assert.equal(sectionId("publishing"), "site");
    assert.equal(sectionId("sync"), "sync");
    assert.equal(sectionId("nonsense"), "");
  });

  it("keep a pocket vault out of the sections it cannot keep, and index them for an instance only", () => {
    for (const id of POCKET_HIDDEN_TABS) {
      assert.ok(SETTINGS_INDEX.filter((e) => e.tab === id).every((e) => e.mode === "instance"), `${id} has a row a pocket would be offered`);
    }
  });
});
