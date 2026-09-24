// SOURCE IS TEXT. A literal NUL or other C0 control character in a source
// file makes grep call the file binary ("Binary file server/texNote.ts
// matches") and hides every line of it from a search — five files had one,
// each a separator inside a string or a regex class that an escape spells
// just as well (`\u0000`). Tabs, newlines and carriage returns are text.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "release") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs|css)$/.test(name)) out.push(p);
  }
  return out;
}

describe("source files are text", () => {
  it("no literal control character in client/, server/, shared/, mobile/src/, scripts/, tests/", () => {
    const offenders = ["client", "server", "shared", "mobile/src", "scripts", "tests"]
      .flatMap((d) => walk(path.join(root, d)))
      .filter((f) => CONTROL.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f));
    assert.deepEqual(offenders, [], "spell it as an escape (\\u0000) instead");
  });
});
