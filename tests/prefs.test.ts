// The vault-side half of "settings travel with the vault" (server/prefs.ts):
// what the file accepts, and how two devices' answers merge.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePrefs, sanitizePrefs, type PrefMap } from "../server/prefs.ts";
import { TRAVELLING_KEYS } from "../client/prefsSync.ts";
import { TRAVEL_COPY } from "../client/components/settings/travelCopy.ts";

test("sanitizePrefs keeps well-formed prefixed keys and drops the rest", () => {
  const out = sanitizePrefs({
    "astrolabe.theme": { v: "graphite", t: 10 },
    "astrolabe.gone": { v: null, t: 11 },
    "vellum.theme": { v: "x", t: 1 }, // wrong prefix
    "astrolabe.bad": { v: 3, t: 1 }, // value not a string
    "astrolabe.nostamp": { v: "x" },
    "astrolabe.has space": { v: "x", t: 1 },
    "astrolabe.float": { v: "x", t: 5.9 },
  });
  assert.deepEqual(out, {
    "astrolabe.theme": { v: "graphite", t: 10 },
    "astrolabe.gone": { v: null, t: 11 },
    "astrolabe.float": { v: "x", t: 5 },
  });
  assert.deepEqual(sanitizePrefs(null), {});
  assert.deepEqual(sanitizePrefs("nope"), {});
});

test("mergePrefs: newest stamp wins per key, a tie keeps the file's copy", () => {
  const base: PrefMap = {
    "astrolabe.theme": { v: "paper", t: 100 },
    "astrolabe.lang": { v: "ar", t: 100 },
  };
  const incoming: PrefMap = {
    "astrolabe.theme": { v: "graphite", t: 200 }, // newer: wins
    "astrolabe.lang": { v: "en", t: 100 }, // tie: file keeps ar
    "astrolabe.vim": { v: "1", t: 50 }, // new key: lands
  };
  const { merged, changed } = mergePrefs(base, incoming);
  assert.equal(changed, true);
  assert.deepEqual(merged, {
    "astrolabe.theme": { v: "graphite", t: 200 },
    "astrolabe.lang": { v: "ar", t: 100 },
    "astrolabe.vim": { v: "1", t: 50 },
  });
  assert.equal(mergePrefs(merged, incoming).changed, false);
});

test("a tombstone travels like a value: a clear on one device clears the next", () => {
  const base: PrefMap = { "astrolabe.theme": { v: "paper", t: 100 } };
  const { merged } = mergePrefs(base, { "astrolabe.theme": { v: null, t: 300 } });
  assert.deepEqual(merged["astrolabe.theme"], { v: null, t: 300 });
});

// The CLIENT'S half: which keys travel. Pinned here, against the table in
// docs/backup-and-sync.md, because adding a key is a decision about every
// device the owner has and dropping one is a preference that quietly stays
// behind — both worth a red test rather than a diff nobody reads.
test("which preferences travel: what a person would call a setting, and the three ledgers the owner said yes to", () => {
  const travels = new Set(TRAVELLING_KEYS);
  for (const key of [
    "theme",
    "site-theme",
    "lang",
    "editorLang",
    "vim",
    "relativeLines",
    "editorWidth",
    "editorWidthCustom",
    "headingNumbers",
    "selToolbar",
    "sidebarSide",
    "tags-sort",
    "whatsnew",
    "frenchAutocorrect",
    // 3.18.0: where each course was left, the properties panel, reading mode.
    "library",
    "properties",
    "reading",
  ]) {
    assert.ok(travels.has(key), `${key} must travel`);
  }
  // Window state describes THIS window on THIS screen and never travels; a
  // phone inheriting a desktop's four-column layout would be a bug.
  for (const key of ["tabs", "workspace", "paneWidths", "recents", "windowId", "sidebar-collapsed", "panel-collapsed", "prefs-sync", "prefs-sync-off", "warmth", "dim"]) {
    assert.ok(!travels.has(key), `${key} must stay on the device`);
  }
  assert.ok(travels.has("library") && !travels.has("library.session"), "the course ledger, not any sub-key");
});

// The travel row's copy table lives in the settings chunk rather than the
// dictionary (client/components/settings/travelCopy.ts), so check-i18n does not
// walk it — this is that table's parity gate, with the same rules.
test("the travel row's own copy has both languages and matching placeholders", () => {
  const ph = (s: string): string => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const [key, text] of Object.entries(TRAVEL_COPY)) {
    assert.ok(text.en.trim() !== "", `${key}: empty en`);
    assert.ok(text.ar.trim() !== "", `${key}: empty ar`);
    assert.ok(/[؀-ۿ]/.test(text.ar), `${key}: ar has no Arabic script`);
    assert.notEqual(text.en, text.ar, `${key}: untranslated`);
    assert.equal(ph(text.en), ph(text.ar), `${key}: placeholders differ`);
  }
  assert.ok(Object.keys(TRAVEL_COPY).length >= 20);
});
