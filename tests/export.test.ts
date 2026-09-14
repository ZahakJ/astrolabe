// Export (server/export.ts + indexer `exportSelection`): what each scope
// takes, which attachments ride along, the rewrite applied to the copies
// and not the vault, the cap, and the archive that actually streams.
//
// Through a fixture vault, the way tests/tracker.test.ts tests the shelf's
// scope: the selection is answered by the index's own attachment walk, so
// the claim under test is "an export carries exactly what the app would
// show for these notes", and that is only checkable against real records.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { exportSelection, initIndexer } from "../server/indexer.ts";
import { contentDisposition, exportStream, parseExportQuery, planExport, summarize } from "../server/export.ts";
import { initSite } from "../server/site.ts";
import { initVault, VaultError } from "../server/vault.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

const PNG = "\x89PNG\r\n\x1a\n0123";

const files: Record<string, string> = {
  "Ideas.md": note({ tags: "[reading]" }, "# Ideas\n\nSee [[Deep note]] and ![[cover.png]] and [[Nowhere]].\n\n![alt](Media/inline.png)\n"),
  "Folder/Deep note.md": note({}, "Back to [[Ideas#Ideas]]. #reading\n\n```\n[[Ideas]] in a fence\n```\n"),
  "Folder/Sub/Leaf.md": "Leaf. [[Ideas]]\n",
  "ملاحظات/فكرة.md": "# فكرة\n\nانظر [[Ideas]]\n",
  "Media/cover.png": PNG,
  "Media/inline.png": PNG,
  "Media/unused.png": PNG,
  "Paper.tex": "\\section{Paper}\n",
};

const data = makeDir();
const root = makeVault(files);

before(async () => {
  initSite({ ASTROLABE_DATA: data });
  initVault(root);
  await initIndexer();
});

after(() => {
  removeVault(root);
  removeVault(data);
});

async function collect(stream: ReadableStream): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The central directory's names and each entry's bytes — enough of a
 *  reader to prove the stream is the plan. */
function entriesOf(bytes: Uint8Array): { name: string; data: string }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const endAt = bytes.length - 22;
  assert.equal(view.getUint32(endAt, true), 0x06054b50);
  const count = view.getUint16(endAt + 10, true);
  let at = view.getUint32(endAt + 16, true);
  const out: { name: string; data: string }[] = [];
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(at, true), 0x02014b50);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    const localNameLen = view.getUint16(offset + 26, true);
    const dataAt = offset + 30 + localNameLen;
    out.push({ name, data: dec.decode(bytes.subarray(dataAt, dataAt + size)) });
    at += 46 + nameLen;
  }
  return out;
}

describe("exportSelection — what a scope takes", () => {
  it("one note and the files it points at, by every route the renderer honours", () => {
    const sel = exportSelection("note", "Ideas.md", true);
    assert.deepEqual(sel.notes, ["Ideas.md"]);
    // The wikilink embed AND the standard-markdown image; never the unused one.
    assert.deepEqual(sel.attachments, ["Media/cover.png", "Media/inline.png"]);
    assert.deepEqual(exportSelection("note", "Ideas.md", false).attachments, []);
  });

  it("a folder is its subtree, every format", () => {
    assert.deepEqual(exportSelection("folder", "Folder", true).notes, ["Folder/Deep note.md", "Folder/Sub/Leaf.md"]);
    assert.deepEqual(exportSelection("folder", "", false).notes, exportSelection("vault", "", false).notes);
    assert.ok(exportSelection("vault", "", false).notes.includes("Paper.tex"));
    assert.ok(exportSelection("vault", "", false).notes.includes("ملاحظات/فكرة.md"));
  });

  it("a tag is every note carrying it, inline or in frontmatter", () => {
    assert.deepEqual(exportSelection("tag", "reading", false).notes, ["Folder/Deep note.md", "Ideas.md"]);
    assert.deepEqual(exportSelection("tag", "nothing", false).notes, []);
  });
});

describe("parseExportQuery", () => {
  it("names each refusal with a stable code", () => {
    assert.throws(() => parseExportQuery({}), (e: unknown) => e instanceof VaultError && e.code === "exportBadScope");
    assert.throws(() => parseExportQuery({ scope: "note" }), (e: unknown) => e instanceof VaultError && e.code === "exportBadTarget");
    assert.throws(() => parseExportQuery({ scope: "tag", target: "#" }), (e: unknown) => e instanceof VaultError && e.code === "exportBadTarget");
    assert.throws(() => parseExportQuery({ scope: "vault", links: "absolute" }), (e: unknown) => e instanceof VaultError && e.code === "exportBadLinks");
    assert.throws(() => parseExportQuery({ scope: "folder", target: "../etc" }), (e: unknown) => e instanceof VaultError && e.status === 400);
  });

  it("normalizes what it accepts", () => {
    assert.deepEqual(parseExportQuery({ scope: "tag", target: "#Reading" }), { scope: "tag", target: "reading", links: "wiki", attachments: true });
    assert.deepEqual(parseExportQuery({ scope: "vault", attachments: "0", links: "relative" }), { scope: "vault", target: "", links: "relative", attachments: false });
    assert.equal(parseExportQuery({ scope: "folder", target: "Folder/" }).target, "Folder");
  });
});

describe("planExport and the stream", () => {
  it("refuses an empty scope as a 404 the dialog can name", async () => {
    await assert.rejects(planExport({ scope: "tag", target: "nothing", links: "wiki", attachments: true }), (e: unknown) => e instanceof VaultError && e.status === 404 && e.code === "exportEmpty");
  });

  it("streams the vault as on disk when links are kept", async () => {
    const plan = await planExport({ scope: "vault", target: "", links: "wiki", attachments: true });
    const summary = summarize(plan);
    assert.equal(summary.notes, 5);
    assert.equal(summary.attachments, 2, "unused.png rides no note");
    assert.ok(summary.filename.startsWith("vault "));
    const entries = entriesOf(await collect(exportStream(plan)));
    assert.deepEqual(
      entries.map((e) => e.name),
      plan.entries.map((e) => e.name),
    );
    for (const entry of entries) {
      assert.equal(entry.data, readFileSync(path.join(root, entry.name), "utf8"), entry.name);
    }
  });

  it("rewrites the COPIES to relative links and leaves the vault alone", async () => {
    const plan = await planExport({ scope: "folder", target: "Folder", links: "relative", attachments: true });
    const entries = entriesOf(await collect(exportStream(plan)));
    const deep = entries.find((e) => e.name === "Folder/Deep note.md");
    assert.ok(deep);
    // `Ideas.md` is outside the folder, so its link stays a wikilink — and
    // the one in the fence stays whatever it was.
    assert.equal(deep.data, files["Folder/Deep note.md"]);
    const leaf = entries.find((e) => e.name === "Folder/Sub/Leaf.md");
    assert.equal(leaf?.data, "Leaf. [[Ideas]]\n");
    // Now the whole vault: everything resolves, and the picture is an embed.
    const all = entriesOf(await collect(exportStream(await planExport({ scope: "vault", target: "", links: "relative", attachments: true }))));
    const ideas = all.find((e) => e.name === "Ideas.md");
    assert.equal(
      ideas?.data,
      note({ tags: "[reading]" }, "# Ideas\n\nSee [Deep note](Folder/Deep%20note.md) and ![cover.png](Media/cover.png) and [[Nowhere]].\n\n![alt](Media/inline.png)\n"),
    );
    const deepAll = all.find((e) => e.name === "Folder/Deep note.md");
    assert.equal(deepAll?.data, note({}, "Back to [Ideas#Ideas](../Ideas.md#ideas). #reading\n\n```\n[[Ideas]] in a fence\n```\n"));
    const arabic = all.find((e) => e.name === "ملاحظات/فكرة.md");
    assert.equal(arabic?.data, "# فكرة\n\nانظر [Ideas](../Ideas.md)\n");
    // The vault itself is untouched.
    assert.equal(readFileSync(path.join(root, "Ideas.md"), "utf8"), files["Ideas.md"]);
  });

  it("names the download after the scope, Arabic kept, with an ASCII fallback beside it", async () => {
    const plan = await planExport({ scope: "note", target: "ملاحظات/فكرة.md", links: "wiki", attachments: false });
    assert.match(plan.filename, /^فكرة \d{4}-\d{2}-\d{2}\.zip$/);
    const header = contentDisposition(plan.filename);
    assert.match(header, /^attachment; filename="export \d{4}-\d{2}-\d{2}\.zip"; filename\*=UTF-8''%D9%81/);
    assert.match(contentDisposition("Folder 2026-01-01.zip"), /filename="Folder 2026-01-01\.zip"/);
  });
});
