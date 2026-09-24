// THE DICTIONARY, ONE LANGUAGE PER FILE (3.29 sweep, part 2).
//
// client/i18n/en.ts is the key list and client/i18n/ar.ts is held to it by
// type — parity is a compile error, and these cases say so in words as well,
// from the files themselves. Then the runtime half: a page installs one
// language at a time, t() speaks the one set, and a switch waits for its
// strings (whenDictionary) rather than drawing the language it is leaving.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import ar from "../client/i18n/ar.ts";
import en from "../client/i18n/en.ts";
import { importsOf } from "./helpers/importGraph.ts";
import { readDictionary } from "../scripts/dictionary.mjs";

const read = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

describe("the two dictionary files", () => {
  it("hold exactly the same keys, in the same order", () => {
    assert.deepEqual(Object.keys(ar), Object.keys(en));
    assert.ok(Object.keys(en).length > 3000, "the whole dictionary moved, not a slice of it");
  });

  it("give every key a value in both languages, Arabic in Arabic", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      assert.ok(en[key].length > 0, `en.${key} is empty`);
      assert.ok(ar[key].length > 0, `ar.${key} is empty`);
    }
  });

  it("keep parity a TYPE error: the Arabic satisfies the English key list", () => {
    assert.match(read("client/i18n/ar.ts"), /\} satisfies Record<I18nKey, string>;/);
    assert.match(read("client/i18n/ar.ts"), /import type \{ I18nKey \} from "\.\/en\.ts";/);
    assert.match(read("client/i18n/en.ts"), /export type I18nKey = keyof typeof en;/);
  });

  it("read the same through the gates' text reader (scripts/dictionary.mjs)", () => {
    const dict = readDictionary();
    assert.equal(dict.size, Object.keys(en).length);
    assert.deepEqual(dict.strays, []);
    // The reader returns the source text between the quotes; for a value with
    // no escapes that is the value itself.
    assert.equal(dict.get("searchPlaceholder")?.en, en.searchPlaceholder);
    assert.equal(dict.get("searchPlaceholder")?.ar, ar.searchPlaceholder);
  });

  it("are reached by no client module but the loader (and the Node installer)", () => {
    for (const file of ["client/i18n/en.ts", "client/i18n/ar.ts"]) {
      const from = importsOf(file)
        // The key list's TYPE import (i18n.ts, ar.ts) is erased; it fetches nothing.
        .filter((e) => e.from.startsWith("client/") && !(e.names.length === 1 && e.names[0] === "I18nKey"))
        .map((e) => `${e.from}${e.names.includes("*") ? " (dynamic)" : ""}`)
        .sort();
      assert.deepEqual(from, ["client/i18n.ts (dynamic)", "client/i18n/both.ts"], `${file} is imported from ${from.join(", ")}`);
    }
  });
});

describe("one language at a time (client/i18n.ts)", async () => {
  // A fresh module instance: nothing installed yet, as in a page at boot.
  const i18n: typeof import("../client/i18n.ts") = await import(`../client/i18n.ts?fresh=${Date.now()}`);

  it("speaks no dictionary before one is installed, and names the key rather than inventing a string", () => {
    assert.equal(i18n.hasDictionary("en"), false);
    assert.equal(i18n.t("searchPlaceholder"), "searchPlaceholder");
  });

  it("speaks the installed language, and the active one once it is set", () => {
    i18n.installDictionary("en", en);
    i18n.setLang("en");
    assert.equal(i18n.t("searchPlaceholder"), en.searchPlaceholder);
    // Arabic chosen but not yet installed: the installed English, never a key.
    i18n.setLang("ar");
    assert.equal(i18n.t("searchPlaceholder"), en.searchPlaceholder);
    i18n.installDictionary("ar", ar);
    assert.equal(i18n.t("searchPlaceholder"), ar.searchPlaceholder);
    i18n.setLang("en");
  });

  it("runs a switch at once when its strings are already here", () => {
    let ran = false;
    i18n.whenDictionary("ar", () => {
      ran = true;
    });
    assert.equal(ran, true);
  });
});

describe("a switch waits for its strings", async () => {
  const i18n: typeof import("../client/i18n.ts") = await import(`../client/i18n.ts?fresh=wait-${Date.now()}`);

  it("applies after the chunk lands, and a later switch supersedes an earlier one still waiting", async () => {
    i18n.installDictionary("en", en);
    i18n.setLang("en");
    const applied: string[] = [];
    // Arabic is not installed: this one has to wait for the fetch…
    i18n.whenDictionary("ar", () => applied.push("ar"));
    assert.deepEqual(applied, [] as string[], "nothing is applied before the Arabic arrives");
    // …and the reader goes back to English before it lands.
    i18n.whenDictionary("en", () => applied.push("en"));
    assert.deepEqual(applied, ["en"]);
    await i18n.loadDictionary("ar");
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(applied, ["en"], "the superseded Arabic switch never lands");
    assert.equal(i18n.hasDictionary("ar"), true, "…though its strings are kept for next time");
  });
});
