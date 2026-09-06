// The custom theme builder's token list (shared/customTheme.ts) against the
// two things it has to agree with: the surface layer in tokens.css, and the
// dictionary. A token the builder offers without a `:root, [data-theme]`
// derivation would read as "#000000 inherited" in every row; a token without
// a label in both languages would print its raw name to an Arabic reader —
// the half-translation check-i18n exists to catch, one level up.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SURFACE_PAIRS } from "../shared/contrast.ts";
import { SURFACE_TOKENS, THEME_TOKENS, TOKEN_GROUPS, tokenSpec } from "../shared/customTheme.ts";
import { setLang, t } from "../client/i18n.ts";

const css = readFileSync(fileURLToPath(new URL("../client/styles/tokens.css", import.meta.url)), "utf8");
const surfaceBlock = /:root,\s*\[data-theme\]\s*\{([^}]*)\}/.exec(css);

describe("the theme builder's tokens", () => {
  it("names every token once, in exactly one group the builder lays out", () => {
    const names = THEME_TOKENS.map((spec) => spec.name);
    assert.equal(new Set(names).size, names.length);
    for (const spec of THEME_TOKENS) {
      assert.ok(TOKEN_GROUPS.includes(spec.group), `${spec.name} sits in unknown group ${spec.group}`);
      assert.equal(tokenSpec(spec.name), spec);
    }
    assert.ok(THEME_TOKENS.length >= 110, "the widest customisation the owner asked for is at least the surfaces");
  });

  it("gives every surface token a derivation in tokens.css, spelled as the spec says", () => {
    assert.ok(surfaceBlock, "tokens.css carries the `:root, [data-theme]` surface layer");
    const block = surfaceBlock![1];
    for (const spec of SURFACE_TOKENS) {
      const m = new RegExp(`${spec.name.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+);`).exec(block);
      assert.ok(m, `${spec.name} has no default in the surface layer`);
      assert.equal(m![1].trim(), spec.derivedFrom, `${spec.name} derives from what the spec says`);
    }
    // And nothing in the layer that the builder does not offer: a token the
    // CSS reads but nobody can set is a setting that does not exist.
    for (const m of block.matchAll(/(--[\w-]+)\s*:/g)) {
      assert.ok(tokenSpec(m[1]), `${m[1]} is in the surface layer but not in THEME_TOKENS`);
    }
  });

  it("labels every token in both languages, with real Arabic", () => {
    for (const spec of THEME_TOKENS) {
      setLang("en");
      const en = t(spec.label as never);
      setLang("ar");
      const ar = t(spec.label as never);
      assert.notEqual(en, spec.label, `${spec.name} has no English label`);
      assert.ok(/[؀-ۿ]/.test(ar), `${spec.name}'s Arabic label carries no Arabic script: ${ar}`);
      assert.notEqual(en, ar, `${spec.name} has the same label in both languages`);
    }
    setLang("en");
  });

  it("measures only pairs the builder can set, and every surface ground it pairs is a plain colour", () => {
    for (const [token, against] of SURFACE_PAIRS) {
      assert.ok(tokenSpec(token), `${token} is measured but not offered`);
      assert.ok(tokenSpec(against), `${against} is measured but not offered`);
      assert.equal(tokenSpec(against)!.kind, "color", `${against} is a wash; a ratio against it is not a promise`);
    }
  });
});
