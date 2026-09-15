// The desktop's update policy (electron/updatePolicy.ts), held to its word.
//
// A friend's Windows build downloaded a release he had not asked for. The
// header of electron/update.ts had described that behaviour as a feature for
// a year, which is the argument for a policy that is a FUNCTION rather than a
// paragraph: every situation below asks the same three questions — may the
// app check, may it remind, may it download — and the third answer is "no"
// in every row of the table, including the ones where a person is asking.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideUpdate, newer, parseUpdatesPref, type UpdateSituation } from "../electron/updatePolicy.ts";
import { EMPTY_PREFS, parsePrefs } from "../electron/prefs.ts";

const base: UpdateSituation = { pref: "notify", manual: false, current: "3.14.2", latest: "3.15.0", reminded: null };

describe("decideUpdate", () => {
  it("never downloads — not for the timer, not for the menu, not for any version", () => {
    const situations: UpdateSituation[] = [];
    for (const pref of ["notify", "off"] as const) {
      for (const manual of [false, true]) {
        for (const latest of [null, "3.14.2", "3.15.0", "4.0.0", "v3.15.0"]) {
          for (const reminded of [null, "3.15.0", "3.14.9"]) {
            situations.push({ pref, manual, current: "3.14.2", latest, reminded });
          }
        }
      }
    }
    assert.ok(situations.length > 50);
    for (const s of situations) {
      assert.equal(decideUpdate(s).download, false, JSON.stringify(s));
    }
  });

  it("checks quietly by default and says a newer release exists", () => {
    assert.deepEqual(decideUpdate(base), { check: true, remind: true, download: false });
  });

  it("does not remind about a release that is not newer", () => {
    assert.equal(decideUpdate({ ...base, latest: "3.14.2" }).remind, false);
    assert.equal(decideUpdate({ ...base, latest: "3.13.0" }).remind, false);
    assert.equal(decideUpdate({ ...base, latest: null }).remind, false);
  });

  it("reminds ONCE per version per launch from the timer", () => {
    const first = decideUpdate(base);
    assert.equal(first.remind, true);
    const again = decideUpdate({ ...base, reminded: "3.15.0" });
    assert.equal(again.check, true, "the timer keeps checking — a newer release than the reminded one may appear");
    assert.equal(again.remind, false, "the same release six hours later is not news");
    const newerStill = decideUpdate({ ...base, latest: "3.16.0", reminded: "3.15.0" });
    assert.equal(newerStill.remind, true, "a release newer than the reminded one is news again");
  });

  it("answers a manual check every time, reminded or not", () => {
    assert.equal(decideUpdate({ ...base, manual: true, reminded: "3.15.0" }).remind, true);
  });

  it("with updates off, the timer asks nothing and says nothing", () => {
    const off = decideUpdate({ ...base, pref: "off" });
    assert.deepEqual(off, { check: false, remind: false, download: false });
  });

  it("with updates off, a person asking by hand is still answered", () => {
    const off = decideUpdate({ ...base, pref: "off", manual: true });
    assert.deepEqual(off, { check: true, remind: true, download: false });
  });
});

describe("newer", () => {
  it("compares numerically per part, with or without the v", () => {
    assert.equal(newer("3.15.0", "3.14.2"), true);
    assert.equal(newer("v3.15.0", "3.14.2"), true);
    assert.equal(newer("3.14.10", "3.14.9"), true);
    assert.equal(newer("3.14.2", "3.14.2"), false);
    assert.equal(newer("3.14.1", "3.14.2"), false);
    assert.equal(newer("3.15", "3.15.0"), false);
  });
});

describe("the updates preference", () => {
  it("defaults to notify, and only the literal off silences it", () => {
    assert.equal(parseUpdatesPref(undefined), "notify");
    assert.equal(parseUpdatesPref("off"), "off");
    assert.equal(parseUpdatesPref("OFF"), "notify");
    assert.equal(parseUpdatesPref(false), "notify");
    assert.equal(parseUpdatesPref("never"), "notify");
  });

  it("lives in desktop.json beside the window bounds", () => {
    assert.equal(EMPTY_PREFS.updates, "notify");
    assert.equal(parsePrefs({}).updates, "notify");
    assert.equal(parsePrefs({ updates: "off" }).updates, "off");
    assert.equal(parsePrefs({ vaults: [], spellcheck: false, updates: "off" }).spellcheck, false);
  });
});
