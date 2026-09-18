// The settings index (client/components/settings/settingsIndex.ts) and the
// search over it.
//
// The index is GENERATED from the panel's source and gated by
// `npm run check-settings`, so what is worth testing here is not that it
// matches — the gate proves that — but that a reader searching for a thing
// they can see actually finds it, in both languages.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SETTINGS_INDEX } from "../client/components/settings/settingsIndex.ts";
import { DESKTOP_ONLY_ROWS, searchSettings } from "../client/components/settings/searchSettings.ts";
import { setLang, t } from "../client/i18n.ts";

describe("the settings index", () => {
  it("covers every tab the panel has", () => {
    const tabs = new Set(SETTINGS_INDEX.map((e) => e.tab));
    for (const id of ["device", "site", "language", "publishing", "collections", "vault", "sync"]) {
      assert.ok(tabs.has(id), `no rows indexed for the ${id} tab`);
    }
  });

  it("names no key twice within a tab", () => {
    const seen = new Set<string>();
    for (const e of SETTINGS_INDEX) {
      const key = `${e.tab}/${e.label}`;
      assert.ok(!seen.has(key), `duplicate row ${key}`);
      seen.add(key);
    }
  });

  it("spreads the rows evenly — no tab carries more than a screen and a half", () => {
    // The 3.15 re-cut exists because Publishing ran to twenty-one rows while
    // Identity and Typography held five each. A tab nobody scrolls to the end
    // of is a tab whose rows may as well not exist; this pins the shape.
    const counts = new Map<string, number>();
    for (const e of SETTINGS_INDEX) counts.set(e.tab, (counts.get(e.tab) ?? 0) + 1);
    for (const [tab, n] of counts) {
      assert.ok(n <= 18, `${tab} carries ${n} rows`);
      assert.ok(n >= 5, `${tab} carries only ${n} rows`);
    }
  });

  it("puts the desktop's update switch where a search for it lands — on the desktop", () => {
    const row = SETTINGS_INDEX.find((e) => e.label === "rowUpdates");
    assert.ok(row, "the Software updates row is not indexed");
    assert.equal(row.tab, "device");
    setLang("en");
    assert.ok(searchSettings("software updates", true).some((h) => h.entry.label === "rowUpdates"));
    assert.ok(searchSettings("installed", true).some((h) => h.entry.label === "rowUpdates"), "the hint's promise is not searchable");
    setLang("ar");
    assert.ok(searchSettings("تحديثات", true).some((h) => h.entry.label === "rowUpdates"));
    setLang("en");
  });

  it("keeps desktop-only rows out of a browser's results, and names only real rows", () => {
    setLang("en");
    assert.ok(!searchSettings("software updates", false).some((h) => h.entry.label === "rowUpdates"), "a browser search landed on a row it cannot draw");
    assert.ok(!searchSettings("this app's name", false).some((h) => h.entry.label === "rowAppName"));
    for (const label of DESKTOP_ONLY_ROWS) {
      assert.ok(SETTINGS_INDEX.some((e) => e.label === label), `${label} is not an index entry`);
    }
  });

  it("carries the environment variables an operator would search for", () => {
    const envs = new Set(SETTINGS_INDEX.map((e) => e.env).filter(Boolean));
    for (const name of ["SITE_NAME", "SITE_LANG", "PUBLIC_LAYOUT"]) {
      assert.ok(envs.has(name), `${name} is not reachable from the settings search`);
    }
  });
});

// The probes below search AS THE DESKTOP (`true`): they pick their row out
// of the whole index, and the first rows in it are the desktop-only ones a
// browser's search deliberately leaves out.
describe("searching the settings", () => {
  it("finds a row by its own label", () => {
    setLang("en");
    const label = t(SETTINGS_INDEX[0].label);
    const hits = searchSettings(label, true);
    assert.ok(hits.some((h) => h.entry.label === SETTINGS_INDEX[0].label), `"${label}" found nothing`);
  });

  it("finds a row by its ENVIRONMENT VARIABLE — the operator's half", () => {
    setLang("en");
    const hits = searchSettings("SITE_LANG");
    assert.ok(hits.length > 0, "SITE_LANG found nothing");
    assert.equal(hits[0].entry.env, "SITE_LANG");
  });

  it("is case-insensitive, so a variable typed in lower case still lands", () => {
    setLang("en");
    assert.ok(searchSettings("site_lang").length > 0);
  });

  it("returns nothing for an empty query rather than everything", () => {
    assert.deepEqual(searchSettings(""), []);
    assert.deepEqual(searchSettings("   "), []);
  });

  it("ranks a LABEL match above a help-text match", () => {
    setLang("en");
    // A word common enough to appear in both places; the row that is NAMED for
    // it must come first, because that is the one the reader meant.
    const hits = searchSettings("theme");
    assert.ok(hits.length > 1, "expected several theme rows");
    assert.ok(/theme/i.test(t(hits[0].entry.label)), `first hit was "${t(hits[0].entry.label)}"`);
  });

  it("searches ARABIC labels on an Arabic instance, from the same index", () => {
    setLang("ar");
    const entry = SETTINGS_INDEX.find((e) => /[؀-ۿ]/.test(t(e.label)));
    assert.ok(entry, "no Arabic label found — the dictionary is not translated");
    const hits = searchSettings(t(entry.label), true);
    assert.ok(hits.some((h) => h.entry.label === entry.label), "an Arabic label found nothing");
    setLang("en");
  });

  it("matches at a WORD START, so 'graph' no longer answers with para-graph", () => {
    setLang("en");
    const labels = (q: string) => searchSettings(q, true).map((h) => t(h.entry.label));
    assert.ok(!labels("graph").includes(t("rowTextDirection")), "'graph' matched inside 'paragraph'");
    assert.ok(!labels("date").includes(t("rowWhatsNew")), "'date' matched inside 'update'");
    // …while a word that begins a label or a hint still lands.
    assert.ok(labels("date").includes(t("rowDateCalendar")));
  });

  it("finds the rows a reader searches for by the words they use", () => {
    setLang("en");
    const labels = (q: string): string[] => searchSettings(q, true).map((h) => h.entry.label);
    for (const q of ["font", "fonts"]) {
      for (const row of ["rowFontProse", "rowFontMono", "rowFontArabic"]) {
        assert.ok(labels(q).includes(row), `"${q}" did not find ${row}`);
      }
    }
    assert.ok(labels("typeface").includes("rowFontUi"), "'typeface' found nothing");
    assert.ok(labels("width").includes("rowEditorWidth"), "'width' found nothing");
    assert.ok(labels("dark mode").includes("rowYourTheme"), "'dark mode' found nothing");
    assert.ok(labels("history").includes("rowNoteVersions"), "'history' found nothing");
    assert.ok(labels("rtl").includes("rowTextDirection"), "'rtl' found nothing");
    assert.ok(labels("designer").includes("rowOpenDesigner"), "'designer' found nothing");
    assert.ok(labels("SITE_LANG").includes("rowLanguage"), "an env name lost its word-start match on the underscore");
  });

  it("folds the alef family — and the fold provably DOES something", () => {
    setLang("ar");
    // The first version of this test compared the two spellings and passed
    // while both returned [] — two empty lists agreeing that the fold was
    // broken. So first find a label that really contains a hamza-alef, then
    // assert the BARE spelling finds it: non-empty, or the test says nothing.
    const hamza = SETTINGS_INDEX.find((e) => /[\u0622\u0623\u0625]/.test(t(e.label)));
    assert.ok(hamza, "no hamza-alef label in the index — pick another probe");
    const bare = t(hamza.label).replace(/[\u0622\u0623\u0625]/g, "\u0627");
    const hits = searchSettings(bare, true);
    assert.ok(
      hits.some((h) => h.entry.label === hamza.label),
      `bare-alef "${bare}" did not find the hamza-spelled label "${t(hamza.label)}"`,
    );
    setLang("en");
  });
});
