// The settings form, out of the dialog (3.27.0). SettingsModal.tsx was split
// so the phone shell could host the same tabs as pushed screens; these hold
// the two things the split must not have moved: the form's round trip with
// the server (what the panel loads, it can save back unchanged, and an edit
// becomes a patch of exactly that key which the server accepts), and one
// switch that draws every tab the rail lists, in both shells.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { buildPatch, formFrom, validate } from "../client/components/settings/form.ts";
import { POCKET_HIDDEN_TABS, TABS, tabIntro } from "../client/components/settings/tabs.ts";
import { patchSettings, settingsResponse } from "../server/settings.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string): string => readFileSync(path.join(repo, p), "utf8");

const data = makeDir();
const root = makeVault({ "Home.md": "# Home\n", "Templates/Daily.md": "# {{date}}\n" });

before(() => {
  initSite({ ASTROLABE_DATA: data });
  initVault(root);
});

after(() => {
  removeVault(root);
  removeVault(data);
});

describe("the settings form, as both hosts hold it", () => {
  it("loads clean: no errors and an empty patch", () => {
    const form = formFrom(settingsResponse());
    assert.deepEqual(validate(form), {});
    assert.deepEqual(buildPatch(form, form), {});
  });

  it("an edit is a patch of that key, and the server takes it back as the form", () => {
    const initial = formFrom(settingsResponse());
    const edited = { ...initial, tagline: "Notes from the canopy", syncInterval: "60", language: "ar" };
    assert.deepEqual(validate(edited), {});
    const patch = buildPatch(initial, edited);
    assert.deepEqual(Object.keys(patch).sort(), ["gitSync", "language", "tagline"]);
    assert.equal(patch.tagline, "Notes from the canopy");
    const after = formFrom(patchSettings(patch as Record<string, unknown>));
    assert.equal(after.tagline, "Notes from the canopy");
    assert.equal(after.language, "ar");
    assert.equal(after.syncInterval, "60");
    // Saved, the form is clean again — the Save button goes quiet.
    assert.deepEqual(buildPatch(after, after), {});
    assert.deepEqual(buildPatch(edited, after), {});
  });

  it("a field the rules refuse is named, and a refused form is not clean", () => {
    const initial = formFrom(settingsResponse());
    const bad = { ...initial, blogLocale: "not a locale!!" };
    assert.ok("blogLocale" in validate(bad));
  });
});

describe("one switch draws every tab", () => {
  const body = read("client/components/settings/TabBody.tsx");
  it("every tab the rail lists has a body line in TabBody.tsx", () => {
    for (const tab of TABS) assert.match(body, new RegExp(`\\{tab === "${tab.id}" &&`), tab.id);
  });
  it("the tabs a pocket vault hides are instance-only in the switch", () => {
    for (const id of POCKET_HIDDEN_TABS) assert.match(body, new RegExp(`\\{tab === "${id}" && !pocket &&`), id);
  });
  it("the dialog no longer carries a tab body of its own", () => {
    const modal = read("client/components/SettingsModal.tsx");
    assert.doesNotMatch(modal, /\{tab === "[a-z]+" &&/);
    assert.match(modal, /<TabBody tab=\{tab\} \/>/);
  });
  it("the pocket's Backup & sync says what the phone does", () => {
    assert.equal(tabIntro("sync", true), "pocketSyncNote");
    assert.equal(tabIntro("sync", false), "syncNote");
  });
});
