// The stylesheet half of check-ink (scripts/check-ink.mjs), with no browser:
// the two patterns that cut Arabic marks, held out of every stylesheet the
// client ships. The tokens they read are in client/styles/tokens.css, under
// "Leading for a script with marks above and below".
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const client = fileURLToPath(new URL("../client", import.meta.url));

function sheets(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sheets(p));
    else if (entry.name.endsWith(".css")) found.push(p);
  }
  return found;
}

/** Every declaration block, with its selector and the line it starts on.
 *  Innermost blocks only — an @media wrapper is not a rule. */
function rules(file: string): { where: string; selector: string; body: string }[] {
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  const out = [];
  for (const m of src.matchAll(/([^{};]*)\{([^{}]*)\}/g)) {
    const line = src.slice(0, m.index).split("\n").length;
    out.push({ where: `${file.slice(client.length + 1)}:${line}`, selector: m[1].trim(), body: m[2] });
  }
  return out;
}

const all = sheets(client).flatMap(rules);

describe("ink: the stylesheets", () => {
  it("found the stylesheets", () => {
    assert.ok(all.length > 2000, `only ${all.length} rules read`);
  });

  it("a truncating label clips sideways only", () => {
    // `overflow: hidden` clips both axes, so the marks over and under a
    // one-line label were cut; it also drops a flex item's automatic minimum,
    // which squeezed a long note's outline rows to half a line.
    // `overflow: clip visible` truncates with the same ellipsis and paints
    // the marks. A clamp is the exception, and has its own rule below.
    const bad = all.filter(
      (r) =>
        /text-overflow:\s*ellipsis/.test(r.body) &&
        !/line-clamp/.test(r.body) &&
        /(^|[;\s])overflow:\s*hidden\s*;/.test(r.body),
    );
    assert.deepEqual(
      bad.map((r) => `${r.where} ${r.selector}`),
      [],
      "use `overflow: clip visible; min-width: 0` for a one-line ellipsis",
    );
  });

  it("a clamped snippet sets its leading through --snippet-leading", () => {
    const bad = all.filter(
      (r) => /line-clamp/.test(r.body) && /line-height:\s*[0-9.]+\s*;/.test(r.body),
    );
    assert.deepEqual(
      bad.map((r) => `${r.where} ${r.selector}`),
      [],
      "write `line-height: var(--snippet-leading, <latin value>)`",
    );
  });

  it("the tokens are set for right-to-left blocks and dropped again for left-to-right ones", () => {
    const tokens = readFileSync(join(client, "styles/tokens.css"), "utf8");
    const rtl = /:dir\(rtl\)\s*\{([^}]*)\}/.exec(tokens)?.[1] ?? "";
    const ltr = /:dir\(ltr\)\s*\{([^}]*)\}/.exec(tokens)?.[1] ?? "";
    for (const name of ["--display-leading", "--snippet-leading", "--rule-clearance"]) {
      assert.match(rtl, new RegExp(`${name}:\\s*[0-9.]+(em)?;`), `${name} under :dir(rtl)`);
      assert.match(ltr, new RegExp(`${name}:\\s*initial;`), `${name} reset under :dir(ltr)`);
    }
  });

  it("the editor's headings and the reading view's read the same token", () => {
    const theme = readFileSync(join(client, "editor/theme.ts"), "utf8");
    const reading = readFileSync(join(client, "reading/reading.css"), "utf8");
    assert.match(theme, /lineHeight: "var\(--display-leading, 1\.3\)"/);
    assert.match(theme, /paddingBottom: "var\(--rule-clearance, 0\.2em\)"/);
    assert.match(reading, /\.s-rv \.s-rv-h \{[^}]*line-height: var\(--display-leading, 1\.3\);/);
    assert.match(reading, /\.s-rv \.s-rv-h1 \{[^}]*padding-bottom: var\(--rule-clearance, 0\.2em\);/);
  });
});
