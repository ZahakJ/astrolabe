// Unused attachments (indexer `unreferencedAttachments()` + server/
// unusedAttachments.ts): every route a file is USED by keeps it off the
// list — an embed, a markdown image, a wikilink to a file, a banner, a
// tracker cover, a folder icon from settings, a drawing's own svg, a site
// image — and a file under `.trash/` is not in the vault at all.
//
// Over a fixture vault, the way tests/export.test.ts tests the archive: the
// answer comes from the index's own attachment walk, so the claim under
// test is "the list is the complement of what the app would show", and that
// is only checkable against real records.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initIndexer, unreferencedAttachments } from "../server/indexer.ts";
import { UNUSED_ATTACHMENTS_MAX, listUnusedAttachments } from "../server/unusedAttachments.ts";
import { patchSettings } from "../server/settings.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

const PNG = "\x89PNG\r\n\x1a\n0123";
const fence = (lines: string[]): string => ["```tracker", ...lines, "```"].join("\n");

const files: Record<string, string> = {
  // Embedded by wikilink, by markdown image, and linked (not embedded).
  "Essay.md": note({ banner: "hero.jpg" }, "# Essay\n\n![[figure.png]]\n\n![inline](Media/inline.png)\n\nSee [[paper.pdf]].\n"),
  // A tracker's cover, which lives inside a code fence no markdown scanner reads.
  "Shelf.md": note({}, `# Shelf\n\n${fence(["title: Dune", "kind: book", "progress: 1/2", "cover: dune.jpg"])}\n`),
  // A folder note whose own icon is an image.
  "Media/Media.md": note({ icon: "Media/mark.svg" }, "The media folder.\n"),
  // A drawing keeps its exported picture beside it.
  "Sketch.excalidraw": JSON.stringify({ type: "excalidraw", version: 2, elements: [], appState: {}, files: {} }),
  "Sketch.excalidraw.svg": "<svg/>",
  "Media/figure.png": PNG,
  "Media/inline.png": PNG,
  "Media/hero.jpg": PNG,
  "Media/dune.jpg": PNG,
  "Media/mark.svg": "<svg/>",
  "Media/paper.pdf": "%PDF-1.4",
  // Named by settings: a folder icon and the site logo.
  "icons/folder.png": PNG,
  "brand/logo.png": PNG,
  // The ones nothing points at.
  "Media/stale.png": PNG,
  "attachments/old-recording.m4a": "\x00\x00",
  "ملاحظات/صورة قديمة.png": PNG,
  // Under `.trash/`: not in the vault, so neither used nor unused.
  ".trash/gone.png": PNG,
};

const data = makeDir();
const root = makeVault(files);

before(async () => {
  initSite({ ASTROLABE_DATA: data });
  initVault(root);
  await initIndexer();
  patchSettings({ folderIcons: { icons: "icons/folder.png" }, logo: "brand/logo.png" });
});

after(() => {
  removeVault(root);
  removeVault(data);
});

describe("unreferencedAttachments()", () => {
  it("lists exactly the files no note, setting or drawing points at", () => {
    assert.deepEqual(unreferencedAttachments(), [
      "attachments/old-recording.m4a",
      "Media/stale.png",
      "ملاحظات/صورة قديمة.png",
    ]);
  });
  it("keeps every used route off the list", () => {
    const unused = new Set(unreferencedAttachments());
    for (const used of [
      "Media/figure.png", // ![[embed]]
      "Media/inline.png", // ![alt](path)
      "Media/paper.pdf", // [[link]] to a file
      "Media/hero.jpg", // banner:
      "Media/dune.jpg", // tracker cover:
      "Media/mark.svg", // folder note icon:
      "Sketch.excalidraw.svg", // a drawing's export
      "icons/folder.png", // settings.folderIcons
      "brand/logo.png", // settings.logo
    ]) {
      assert.equal(unused.has(used), false, `${used} should count as used`);
    }
  });
  it("never sees .trash", () => {
    assert.ok(!unreferencedAttachments().some((p) => p.startsWith(".trash/")));
  });
});

describe("listUnusedAttachments()", () => {
  it("stats each file and reports the true total", async () => {
    const result = await listUnusedAttachments();
    assert.equal(result.total, 3);
    assert.equal(result.files.length, 3);
    const stale = result.files.find((f) => f.path === "Media/stale.png");
    assert.ok(stale);
    // The fixture is written as UTF-8 (helpers/vault.ts), so the size is
    // the encoded length, not the code-point count.
    assert.equal(stale.size, Buffer.byteLength(PNG, "utf8"));
    assert.ok(stale.mtimeMs > 0);
    assert.ok(UNUSED_ATTACHMENTS_MAX >= result.files.length);
  });
});
