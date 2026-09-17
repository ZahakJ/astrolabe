import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// ONE thin bar, two engines, and the two rules must never meet on one element.
// Chromium (121+) honours the standard `scrollbar-width`/`scrollbar-color`
// pair, and once either is set to anything but `auto` on an element it IGNORES
// every `::-webkit-scrollbar` rule for that element and draws its own classic
// ~10px rail. `* { scrollbar-width: thin }` in app.css therefore switched the
// styled 8px bar off everywhere, and the tree, the tags and the search results
// wore a grey rail for two releases while the stylesheet described a thumb on
// glass (windows-plan defect B, measured at 10px in headless Chromium and in
// Linux Electron). The rule now lives under `@supports not
// selector(::-webkit-scrollbar)`, i.e. Firefox only — and no other sheet may
// re-introduce the pair on a scroller. `none` is the one value both engines
// agree on (a hidden bar is hidden either way), so it stays allowed.
const stylesDir = fileURLToPath(new URL("../client/styles/", import.meta.url));

/** The sheet with its comments blanked (newlines kept, so line numbers hold):
 *  the comments explaining this very rule quote the forbidden text. */
const uncommented = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

const sheets = readdirSync(stylesDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => [f, uncommented(readFileSync(stylesDir + f, "utf8"))] as const);

/** Every `scrollbar-width: <value>` / `scrollbar-color:` declaration in a
 *  sheet with whether it sits inside a Firefox-only @supports block. */
function declarations(css: string): { value: string; guarded: boolean; line: number }[] {
  const out: { value: string; guarded: boolean; line: number }[] = [];
  const guard = /@supports\s+not\s+selector\(::-webkit-scrollbar\)\s*\{/g;
  const guarded: [number, number][] = [];
  for (const m of css.matchAll(guard)) {
    // The block ends at the brace that balances the @supports's own.
    let depth = 1;
    let i = m.index! + m[0].length;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    guarded.push([m.index!, i]);
  }
  for (const m of css.matchAll(/scrollbar-(?:width|color)\s*:\s*([^;]+);/g)) {
    const at = m.index!;
    out.push({
      value: m[1].trim(),
      guarded: guarded.some(([a, b]) => at > a && at < b),
      line: css.slice(0, at).split("\n").length,
    });
  }
  return out;
}

describe("the thin scrollbar", () => {
  it("serves the standard pair to Firefox only, from app.css's universal rule", () => {
    const app = sheets.find(([f]) => f === "app.css")![1];
    assert.match(
      app,
      /@supports not selector\(::-webkit-scrollbar\)\s*\{\s*\*\s*\{\s*scrollbar-width:\s*thin;\s*scrollbar-color:[^}]*\}\s*\}/,
      "app.css carries the universal thin rule under the Firefox-only guard",
    );
    assert.match(app, /\*::-webkit-scrollbar\s*\{\s*width:\s*8px;/, "and the 8px ::-webkit bar Chromium draws");
  });

  it("is never re-declared on a scroller where Chromium would drop the ::-webkit rules", () => {
    const offenders: string[] = [];
    for (const [file, css] of sheets) {
      for (const d of declarations(css)) {
        if (d.guarded || d.value === "none") continue;
        offenders.push(`${file}:${d.line} scrollbar-…: ${d.value}`);
      }
    }
    assert.deepEqual(offenders, [], "unguarded scrollbar-width/-color declarations");
  });

  it("is not set by the editor's own theme either", () => {
    const theme = readFileSync(fileURLToPath(new URL("../client/editor/theme.ts", import.meta.url)), "utf8");
    assert.doesNotMatch(theme, /scrollbarWidth\s*:/, "client/editor/theme.ts sets no scrollbar-width");
  });
});

describe("the pane grips", () => {
  it("are hidden by width, never by the pointer's kind", () => {
    const app = sheets.find(([f]) => f === "app.css")![1];
    // Every @media block that hides a grip is either the phone's or the
    // drawer's: windows-plan defect F was a pointer-only arm hiding the grips
    // on a slate at every width.
    for (const m of app.matchAll(/@media([^{]*)\{[^{}]*(?:\{[^{}]*\}[^{}]*)*?\.s-pane-grip[^{}]*\{\s*display:\s*none;/g)) {
      const query = m[1].trim();
      assert.ok(
        query === "(max-width: 700px)" || query.startsWith("(max-width: 700px), ((max-width: 999px)"),
        `a grip is hidden under "${query}", which is not a width`,
      );
    }
    assert.doesNotMatch(app, /not all and \(any-pointer: fine\)/, "no pointer-only arm survives in app.css");
  });
});
