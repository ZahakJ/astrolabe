// The settings' design, held to its catalogue (contracts/settings-design.md).
//
// Every row in the app is exactly one of ten control kinds, drawn by that
// kind's one component at that kind's one width. The index carries each
// row's kind (read from `kind="…"` on the Row in the source); this test holds
// the index to the catalogue, and the SOURCE to the index — a row that says
// `kind="chips"` and draws four toggles is the 3.38.0 dictionaries row, and
// fails here by name. It also holds the pages to the design: their groups,
// their length, and the "This device, said once" rule.

import "../client/i18n/both.ts";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CONTROL_KINDS, SETTABLE_KINDS, type ControlKind } from "../client/components/settings/catalogue.ts";
import { SETTINGS_INDEX } from "../client/components/settings/settingsIndex.ts";
import { GROUPS, TABS, devicePage } from "../client/components/settings/tabs.ts";
import { setLang, t } from "../client/i18n.ts";

const DIR = new URL("../client/components/settings/", import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));

/** What each kind's component looks like in the source. */
const DRAWN_BY: Record<ControlKind, RegExp> = {
  toggle: /<Toggle\b/,
  segmented: /<SegmentedControl\b/,
  select: /<Select\b|<FontPicker\b|s-smodal__themebtn|<VoiceModelFields\b/,
  chips: /<Chips\b/,
  slider: /<LevelSlider\b|type="range"/,
  path: /<PathInput\b|<ImageField\b/,
  text: /<TextInput\b|<NumberInput\b|<textarea\b|<UniqueNoteFields\b/,
  table: /<(?:PeriodicForm|TagLabelEditor|PublicFolderEditor|LibraryRootsEditor|LibraryPathEditor|ReadAloudControls|OwnVoicesControls)\b/,
  action: /<button\b|<ClipperControl\b/,
  status: /s-smodal__sync|s-smodal__status|<(?:SyncStatusBlock|AskStatusBlock)\b/,
};
/** Controls a kind must NOT be drawn with — the catalogue's "Never". */
const NEVER: Partial<Record<ControlKind, RegExp>> = {
  chips: /<Toggle\b/,
};

interface Block {
  file: string;
  tag: "Row" | "Part";
  kind: string;
  label: string;
  body: string;
}

/** Every <Row …>…</Row> and <Part …>…</Part> in the settings sources, with
 *  its kind and label key (a ternary label counts by its first key). */
function blocks(): Block[] {
  const out: Block[] = [];
  for (const file of files) {
    const src = readFileSync(new URL(file, DIR), "utf8");
    for (const m of src.matchAll(/<(Row|Part)\b([^>]*?)>([\s\S]*?)<\/\1>/g)) {
      if (file === "Row.tsx") continue;
      const head = m[2];
      out.push({
        file,
        tag: m[1] as "Row" | "Part",
        kind: /\bkind="(\w+)"/.exec(head)?.[1] ?? "",
        label: /label=\{t\((?:[^"]*\? )?"(\w+)"/.exec(head)?.[1] ?? "",
        body: m[3],
      });
    }
  }
  return out;
}

describe("the control catalogue", () => {
  it("has ten kinds, seven of them set by a reader", () => {
    assert.equal(CONTROL_KINDS.length, 10);
    assert.deepEqual([...SETTABLE_KINDS].sort(), ["chips", "path", "segmented", "select", "slider", "text", "toggle"]);
  });

  it("names a kind for every row and part in the index", () => {
    for (const e of SETTINGS_INDEX) assert.ok((CONTROL_KINDS as readonly string[]).includes(e.kind), `${e.label} is kind "${e.kind}"`);
  });

  it("draws every row with its kind's component, and never with the one its kind forbids", () => {
    const found = blocks();
    assert.ok(found.length >= 100, `only ${found.length} Row/Part blocks read — the reader is broken`);
    for (const b of found) {
      assert.ok((CONTROL_KINDS as readonly string[]).includes(b.kind), `${b.file}: <${b.tag}> ${b.label} has no kind`);
      const kind = b.kind as ControlKind;
      assert.match(b.body, DRAWN_BY[kind], `${b.file}: ${b.label} says kind="${kind}" and draws no ${kind}`);
      const never = NEVER[kind];
      if (never) assert.doesNotMatch(b.body, never, `${b.file}: ${b.label} (${kind}) draws a control the catalogue forbids for it`);
    }
  });

  it("gives the dictionaries ONE chips control, not a switch per language", () => {
    const row = blocks().find((b) => b.label === "rowSpellDicts");
    assert.ok(row);
    assert.equal(row.kind, "chips");
    assert.doesNotMatch(row.body, /<Toggle\b/);
    assert.equal(SETTINGS_INDEX.find((e) => e.label === "rowSpellDicts")?.kind, "chips");
  });

  it("offers no segmented control more than four segments", () => {
    for (const b of blocks().filter((x) => x.kind === "segmented")) {
      const own = b.tag === "Row" ? b.body.replace(/<Part\b[\s\S]*?<\/Part>/g, "") : b.body;
      const segs = [...own.matchAll(/\{ value: /g)].length;
      assert.ok(segs <= 4, `${b.file}: ${b.label} has ${segs} segments — five or more is a Select`);
    }
  });
});

describe("the pages", () => {
  it("sit in four groups, every group holding at least two pages", () => {
    for (const g of GROUPS) assert.ok(TABS.filter((s) => s.group === g.id).length >= 2, `${g.id} holds fewer than two pages`);
    for (const s of TABS) assert.ok(GROUPS.some((g) => g.id === s.group), `${s.id} is in no group`);
  });

  it("carry each row's group in the index", () => {
    for (const e of SETTINGS_INDEX) assert.equal(e.group, TABS.find((s) => s.id === e.tab)?.group, `${e.label}`);
  });

  it("show at most ten rows before their Advanced line", () => {
    for (const s of TABS) {
      const inSight = SETTINGS_INDEX.filter((e) => e.tab === s.id && e.row === undefined && e.adv !== true && e.mode !== "pocket");
      assert.ok(inSight.length <= 10, `${s.id} shows ${inSight.length} rows`);
    }
  });

  it("say 'This device' once on a page that is all this device's, and mark only the exceptions elsewhere", () => {
    for (const s of TABS) {
      const rows = SETTINGS_INDEX.filter((e) => e.tab === s.id && e.row === undefined);
      if (devicePage(s.id)) assert.ok(rows.every((e) => e.device === true), `${s.id} says all its rows are this device's`);
      else if (rows.length > 0) assert.ok(rows.some((e) => e.device !== true), `${s.id} is all this device's and does not say so once`);
    }
    // The 3.38.0 screenshots had a mark on nearly every row of Appearance.
    const marked = SETTINGS_INDEX.filter((e) => e.device === true && e.row === undefined && !devicePage(e.tab));
    assert.deepEqual(
      marked.map((e) => e.label).sort(),
      ["rowEditorLanguage", "rowFrenchAutocorrect", "rowHeadingNumbers", "rowPrefsSync", "rowSpellDicts", "selToolbarLabel"],
    );
  });

  it("name every page and group in both languages", () => {
    for (const lang of ["en", "ar"] as const) {
      setLang(lang);
      for (const s of TABS) assert.ok(t(s.key).trim() !== "" && t(s.intro).trim() !== "", `${lang}: ${s.id}`);
      for (const g of GROUPS) assert.ok(t(g.key).trim() !== "", `${lang}: ${g.id}`);
    }
    setLang("en");
  });
});
