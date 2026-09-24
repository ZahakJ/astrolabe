// THE COPY SCAN SEES WHAT THE LINE SCAN COULD NOT.
//
// check-i18n's bare-English half used to read .tsx a line at a time with two
// regexes and a two-word floor. `LINE_SCAN` below is that scan, verbatim; the
// fixture is the list of shapes the 3.23 audit said it could not see. Each
// one is asserted MISSED by the old scan and CAUGHT by the syntax-tree scan
// (scripts/i18nScan.mjs), so the claim that the rewrite was needed is a test,
// not a comment.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readShellDictionary, scanDom, scanTsx } from "../scripts/i18nScan.mjs";

/** The retired scan (scripts/check-i18n.mjs before the rewrite), verbatim. */
function LINE_SCAN(source: string): string[] {
  const copyWords = (text: string): number =>
    (text.replace(/\b[\w-]+[./][\w-]+\b/g, " ").match(/[A-Za-z]{2,}/g) ?? []).length;
  const CODEISH = /[={}<>]|&&|\|\||=>|\(\)/;
  const out: string[] = [];
  source.split("\n").forEach((line) => {
    for (const mm of line.matchAll(/>([^<>{}\n]+)</g)) {
      const text = mm[1].trim();
      if (!text || CODEISH.test(text) || copyWords(text) < 2) continue;
      if (/<kbd[ >]/.test(line)) continue;
      out.push(text);
    }
    for (const mm of line.matchAll(/\b(placeholder|title|aria-label|alt)="([^"]+)"/g)) {
      if (copyWords(mm[2]) < 2) continue;
      out.push(mm[2]);
    }
  });
  return out;
}

const CASES: [name: string, tsx: string, caught: string][] = [
  ["a single word", `const A = () => <button>Save</button>;`, "Save"],
  ["an attribute expression", `const A = ({ open }: { open: boolean }) => <button title={open ? "Hide it" : t("show")} />;`, "Hide it"],
  ["a template literal", "const A = ({ n }: { n: string }) => <a aria-label={`Open ${n} now`} />;", "Open … now"],
  ["JSX text split across lines", `const A = () => (\n  <p>\n    Nothing here yet\n  </p>\n);`, "Nothing here yet"],
  ["aria-description", `const A = () => <div aria-description="Drag to reorder" />;`, "Drag to reorder"],
  ["aria-valuetext", `const A = () => <div role="slider" aria-valuetext="Half way" />;`, "Half way"],
  ["a braced string child", `const A = () => <span>{"Loading the shelf"}</span>;`, "Loading the shelf"],
  ["a fallback after ??", `const A = ({ v }: { v?: string }) => <input placeholder={v ?? "Type a name"} />;`, "Type a name"],
];

describe("the JSX copy scan (scripts/i18nScan.mjs)", () => {
  for (const [name, tsx, caught] of CASES) {
    it(`${name}: missed by the line scan, caught on the tree`, () => {
      assert.deepEqual(LINE_SCAN(tsx), [], "the old scan should have missed this");
      assert.deepEqual(scanTsx(tsx).map((f) => f.text), [caught]);
    });
  }

  it("leaves what is not copy alone", () => {
    const quiet = [
      `const A = () => <button title={t("save")}>{t("save")}</button>;`,
      `const A = () => <kbd>Ctrl K</kbd>;`,
      `const A = () => <option value="dashboard">{label}</option>;`,
      `const A = () => <input placeholder="https://" />;`,
      `const A = () => <span className="note-row">GitHub</span>;`,
      `const A = ({ a }: { a: string }) => <i title={a === "open" ? t("x") : t("y")} />;`,
      `const A = () => (\n  // not copy: a folder's literal name on disk\n  <input placeholder="Templates" />\n);`,
    ];
    for (const tsx of quiet) assert.deepEqual(scanTsx(tsx), [], tsx);
  });
});

describe("the DOM copy scan", () => {
  it("follows a multi-line ternary into both arms", () => {
    const ts = `btn.title = folded\n  ? "Unfold section"\n  : "Fold section";`;
    assert.deepEqual(scanDom(ts).map((f) => f.text), ["Unfold section", "Fold section"]);
  });
  it("reads setAttribute's value, never its name, and not a t() argument", () => {
    assert.deepEqual(scanDom(`n.setAttribute("aria-label", "Close panel"); n.setAttribute("title", t("closePanel"));`).map((f) => f.text), ["Close panel"]);
  });
  it("in the shell: el() props and children, and a JSON error body", () => {
    const shell = [
      `el("button", { textContent: "Connect now" });`,
      `el("p", {}, "Nothing was shared");`,
      `new Response(JSON.stringify({ error: "The pocket vault is not open yet", code: "booting" }));`,
      `el("p", { textContent: t.connect }, t.connectLede);`,
    ].join("\n");
    assert.deepEqual(scanDom(shell, "x.ts", { shell: true }).map((f) => f.text), ["Connect now", "Nothing was shared", "The pocket vault is not open yet"]);
    // The pocket's 501 reasons and its path refusals are keys, spoken in the
    // reader's language; a sentence typed in their place is English.
    const pocket = [
      `return fail(501, "Uploading needs a server", "pocket");`,
      `return fail(501, speak("refuseUpload"), "pocket");`,
      `return fail(404, "Not found");`,
      `throw new PocketVaultError("That path is not a path");`,
      `throw new PocketVaultError("vaultPathNotPath");`,
    ].join("\n");
    assert.deepEqual(scanDom(pocket, "x.ts", { shell: true }).map((f) => f.text), ["Uploading needs a server", "That path is not a path"]);
    // The client's object literals are data (release notes, tables), not DOM.
    assert.deepEqual(scanDom(`const row = { title: "Some title" };`), []);
  });
});

describe("the shell's dictionary", () => {
  const dict = readShellDictionary(`
const en = {
  hello: "Hello",
  bye: (who: string) => \`Goodbye, \${who}\`,
  count: (n: number) => \`\${n} note\${n === 1 ? "" : "s"}\`,
};
type Copy = typeof en;
const ar: Copy = {
  hello: "Hello",
  bye: (who: string) => \`وداعًا\`,
  count: (n: number) => \`\${n} من الملاحظات\`,
};`);
  it("reads both columns, with each function's interpolated parameters", () => {
    assert.deepEqual([...dict.en.keys()], ["hello", "bye", "count"]);
    assert.deepEqual(dict.en.get("bye")?.holes, ["who"]);
    assert.deepEqual(dict.ar.get("bye")?.holes, [], "the Arabic dropped the name — check-i18n reports it");
    assert.deepEqual(dict.en.get("count")?.holes, ["n"]);
    assert.deepEqual(dict.ar.get("count")?.holes, ["n"], "a plural branch interpolates the same parameter");
    assert.equal(dict.ar.get("hello")?.text, "Hello", "an untranslated value — check-i18n reports it");
  });
});
