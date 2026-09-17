// The mirror (server/configMirror.ts): its one pure decision, `pickSource`,
// the caps, and then the pass itself over two real temp directories — the
// shape the maturity brief measured (§4.1: a font uploaded on A never reached
// a fresh clone B, because `DIRS` named a directory that no longer existed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DIRS,
  FILE_MAX_BYTES,
  FILES,
  applyCaps,
  mirrorConfig,
  pickSource,
  setFontWarmer,
  travelStatus,
} from "../server/configMirror.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { makeDir } from "./helpers/vault.ts";

test("a file on one side only is copied to the other", () => {
  assert.equal(pickSource({ mtimeMs: 10_000, size: 5 }, null), "data");
  assert.equal(pickSource(null, { mtimeMs: 10_000, size: 5 }), "vault");
  assert.equal(pickSource(null, null), null);
});

test("the newer copy wins, in either direction", () => {
  assert.equal(pickSource({ mtimeMs: 50_000, size: 5 }, { mtimeMs: 10_000, size: 9 }), "data");
  assert.equal(pickSource({ mtimeMs: 10_000, size: 5 }, { mtimeMs: 50_000, size: 9 }), "vault");
});

test("copies a rounding error apart are the same write and settle", () => {
  assert.equal(pickSource({ mtimeMs: 10_000.4, size: 5 }, { mtimeMs: 10_000, size: 5 }), null);
  assert.equal(pickSource({ mtimeMs: 10_000, size: 5 }, { mtimeMs: 10_000.9, size: 5 }), null);
  // Same moment, different bytes: something is off; the later one still wins.
  assert.equal(pickSource({ mtimeMs: 10_000.4, size: 5 }, { mtimeMs: 10_000, size: 6 }), "data");
});

test("on first contact the vault wins whatever the clocks say", () => {
  // The desktop's 31-byte defaults, a day younger than the site's settings.
  assert.equal(pickSource({ mtimeMs: 90_000, size: 31 }, { mtimeMs: 10_000, size: 1373 }, true), "vault");
  // Afterwards, the clocks decide again.
  assert.equal(pickSource({ mtimeMs: 90_000, size: 31 }, { mtimeMs: 10_000, size: 1373 }, false), "data");
  // A vault with no copy still takes this side's file.
  assert.equal(pickSource({ mtimeMs: 90_000, size: 31 }, null, true), "data");
});

test("what travels with the vault: the site's files, the person's ledgers, the uploaded fonts", () => {
  // 3.16.0 added the last three files: named layouts, the book shelf with its
  // reading positions, and the annotations. The owner's test is "run the
  // executable, give it the vault, and everything is there".
  for (const f of ["settings.json", "designs.json", "custom.css", "layouts.json", "books.json", "annotations.json"]) {
    assert.ok(FILES.includes(f), `${f} must travel`);
  }
  // …and the things that must NOT: a token is a device's, history is git's.
  for (const f of ["git-credentials.json", "versions", "session-epoch", "comments.db", "pdftext.json"]) {
    assert.ok(!FILES.includes(f), `${f} must stay on the server`);
  }
  // 3.18.0: the directory entry names the directory the uploads actually
  // live in. `fonts` matched nothing for two releases; the catalog is
  // re-fetchable and is warmed on the receiving side instead of copied.
  assert.deepEqual(DIRS, ["fonts/custom"]);
});

test("the caps: one file over 5 MB is skipped, the rest of a 40 MB folder is skipped, index.json is counted first", () => {
  const MB = 1024 * 1024;
  const { allowed, problems } = applyCaps(
    [
      { rel: "fonts/custom/zz.ttf", size: 3 * MB },
      { rel: "fonts/custom/index.json", size: 100 },
      { rel: "fonts/custom/huge.ttf", size: 6 * MB },
      { rel: "fonts/custom/aa.woff2", size: 3 * MB },
    ],
    5 * MB,
    7 * MB,
  );
  assert.deepEqual(allowed, ["fonts/custom/index.json", "fonts/custom/aa.woff2", "fonts/custom/zz.ttf"]);
  assert.deepEqual(
    problems.map((p) => [p.rel, p.reason]),
    [["fonts/custom/huge.ttf", "too-large"]],
  );
  // The total: 3 + 3 fit under 7; a third 3 MB face would not.
  const over = applyCaps(
    [
      { rel: "fonts/custom/a.ttf", size: 3 * MB },
      { rel: "fonts/custom/b.ttf", size: 3 * MB },
      { rel: "fonts/custom/c.ttf", size: 3 * MB },
    ],
    5 * MB,
    7 * MB,
  );
  assert.deepEqual(over.allowed, ["fonts/custom/a.ttf", "fonts/custom/b.ttf"]);
  assert.deepEqual(over.problems.map((p) => [p.rel, p.reason]), [["fonts/custom/c.ttf", "over-total"]]);
});

// ── The pass over real directories ──────────────────────────────────────

/** Point the server at a data directory and a vault. `mirrorConfig` reads
 *  both through the same accessors the server does. */
function over(data: string, vault: string): void {
  initSite({ ASTROLABE_DATA: data });
  initVault(vault);
}

function write(root: string, rel: string, content: string | Buffer, mtimeSec?: number): string {
  const abs = path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  if (mtimeSec !== undefined) utimesSync(abs, mtimeSec, mtimeSec);
  return abs;
}

function exists(abs: string): boolean {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

const INDEX = JSON.stringify({ version: 1, faces: { "prose-face.woff2": { family: "Prose Face" } } });

test("an uploaded font and its index travel data → vault, and vault → a fresh data directory", async () => {
  setFontWarmer(async () => {});
  const vault = makeDir();
  const dataA = makeDir();
  over(dataA, vault);
  write(dataA, "fonts/custom/prose-face.woff2", "wOF2 not really a font");
  write(dataA, "fonts/custom/index.json", INDEX);
  write(dataA, "settings.json", JSON.stringify({ siteName: "A" }));
  const first = await mirrorConfig();
  assert.deepEqual(first.problems, []);
  assert.ok(first.toVault.includes("fonts/custom/prose-face.woff2"));
  assert.ok(first.toVault.includes("fonts/custom/index.json"));
  assert.ok(exists(path.join(vault, ".astrolabe/fonts/custom/prose-face.woff2")));
  assert.equal(readFileSync(path.join(vault, ".astrolabe/fonts/custom/index.json"), "utf8"), INDEX);

  // Machine B: a fresh ASTROLABE_DATA over the same vault.
  const dataB = makeDir();
  over(dataB, vault);
  const second = await mirrorConfig();
  assert.ok(second.toData.includes("fonts/custom/prose-face.woff2"));
  assert.ok(second.toData.includes("settings.json"));
  assert.equal(readFileSync(path.join(dataB, "fonts/custom/prose-face.woff2"), "utf8"), "wOF2 not really a font");
  assert.equal(readFileSync(path.join(dataB, "settings.json"), "utf8"), JSON.stringify({ siteName: "A" }));
  // A third pass moves nothing: the sides agree.
  const third = await mirrorConfig();
  assert.deepEqual([third.toData, third.toVault], [[], []]);
});

test("the catalog never travels; a 6 MB face is skipped with a named problem and never lands in the vault", async () => {
  setFontWarmer(async () => {});
  const vault = makeDir();
  const data = makeDir();
  over(data, vault);
  write(data, "fonts/catalog/lora/lora-latin.woff2", "cached");
  write(data, "fonts/custom/index.json", INDEX);
  write(data, "fonts/custom/huge-face.ttf", Buffer.alloc(FILE_MAX_BYTES + 1));
  const pass = await mirrorConfig();
  assert.ok(!exists(path.join(vault, ".astrolabe/fonts/catalog/lora/lora-latin.woff2")));
  assert.ok(!exists(path.join(vault, ".astrolabe/fonts/custom/huge-face.ttf")));
  assert.ok(exists(path.join(vault, ".astrolabe/fonts/custom/index.json")));
  assert.deepEqual(
    pass.problems.map((p) => [p.rel, p.reason]),
    [["fonts/custom/huge-face.ttf", "too-large"]],
  );
  // …and the travel row is told.
  const status = await travelStatus();
  assert.equal(status.lastPass?.problems[0]?.rel, "fonts/custom/huge-face.ttf");
});

test("a file absent on both sides does not consume first contact", async () => {
  setFontWarmer(async () => {});
  const vault = makeDir();
  const data = makeDir();
  over(data, vault);
  write(data, "settings.json", "{}");
  await mirrorConfig(); // layouts.json absent everywhere
  // This machine then makes its own layouts, and the vault's copy arrives
  // afterwards by git — older by the clock, but the vault's.
  write(data, "layouts.json", JSON.stringify({ mine: true }), 2_000_000_000);
  write(vault, ".astrolabe/layouts.json", JSON.stringify({ theirs: true }), 1_000_000_000);
  const pass = await mirrorConfig();
  assert.ok(pass.toData.includes("layouts.json"), "first contact: the vault wins");
  assert.equal(readFileSync(path.join(data, "layouts.json"), "utf8"), JSON.stringify({ theirs: true }));
  // Met now: from here the clocks decide.
  write(data, "layouts.json", JSON.stringify({ edited: true }), 2_000_000_100);
  const later = await mirrorConfig();
  assert.ok(later.toVault.includes("layouts.json"));
});

test("mirror-state.json is keyed by the vault: a data directory pointed at another vault is first contact again", async () => {
  setFontWarmer(async () => {});
  const data = makeDir();
  const vaultA = makeDir();
  over(data, vaultA);
  write(data, "settings.json", JSON.stringify({ siteName: "mine" }), 2_000_000_000);
  await mirrorConfig();
  const state = JSON.parse(readFileSync(path.join(data, "mirror-state.json"), "utf8")) as { vault: string; reconciled: string[] };
  assert.ok(state.vault.endsWith(path.basename(vaultA)));
  assert.ok(state.reconciled.includes("settings.json"));

  // The same data directory opens a different vault whose settings are older.
  const vaultB = makeDir();
  write(vaultB, ".astrolabe/settings.json", JSON.stringify({ siteName: "B's site" }), 1_000_000_000);
  over(data, vaultB);
  const pass = await mirrorConfig();
  assert.ok(pass.toData.includes("settings.json"), "the new vault wins its first contact");
  assert.equal(readFileSync(path.join(data, "settings.json"), "utf8"), JSON.stringify({ siteName: "B's site" }));
  const rekeyed = JSON.parse(readFileSync(path.join(data, "mirror-state.json"), "utf8")) as { vault: string };
  assert.ok(rekeyed.vault.endsWith(path.basename(vaultB)));
});

test("a ledger arriving from the vault is private again (0600), whatever mode the clone gave it", async () => {
  if (process.platform === "win32") return;
  setFontWarmer(async () => {});
  const vault = makeDir();
  const data = makeDir();
  over(data, vault);
  const inVault = write(vault, ".astrolabe/books.json", JSON.stringify({ version: 1, books: {} }));
  chmodSync(inVault, 0o644);
  await mirrorConfig();
  assert.equal(statSync(path.join(data, "books.json")).mode & 0o777, 0o600);
});

test("settings.json arriving from the vault warms the catalog faces it names", async () => {
  const asked: string[][] = [];
  setFontWarmer(async (ids) => {
    asked.push(ids);
  });
  const vault = makeDir();
  const data = makeDir();
  over(data, vault);
  write(vault, ".astrolabe/settings.json", JSON.stringify({ fonts: { ui: "lora" } }));
  await mirrorConfig();
  assert.deepEqual(asked, [["lora"]]);
  // A pass that imports nothing warms nothing.
  await mirrorConfig();
  assert.equal(asked.length, 1);
  setFontWarmer(null);
});

test("the travel report: one item per travelling thing, with what the vault holds", async () => {
  setFontWarmer(async () => {});
  const vault = makeDir();
  const data = makeDir();
  over(data, vault);
  write(data, "settings.json", "{}");
  write(data, "fonts/custom/index.json", INDEX);
  write(data, "fonts/custom/prose-face.woff2", "wOF2");
  write(vault, ".astrolabe/prefs.json", JSON.stringify({ version: 1, keys: { "astrolabe.theme": { v: "paper", t: 1 } } }));
  await mirrorConfig();
  const status = await travelStatus();
  assert.deepEqual(
    status.items.map((i) => i.id),
    ["settings", "designs", "customCss", "layouts", "books", "annotations", "fonts", "prefs"],
  );
  const by = Object.fromEntries(status.items.map((i) => [i.id, i]));
  assert.deepEqual(by.settings, { id: "settings", inData: true, inVault: true, count: null });
  assert.deepEqual(by.designs, { id: "designs", inData: false, inVault: false, count: null });
  assert.deepEqual(by.fonts, { id: "fonts", inData: true, inVault: true, count: 1 });
  assert.deepEqual(by.prefs, { id: "prefs", inData: true, inVault: true, count: 1 });
  assert.ok(status.lastPass !== null && status.lastPass.toVault.includes("settings.json"));
  assert.ok(status.reconciled >= 3);
});
