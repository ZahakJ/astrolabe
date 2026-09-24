// WHAT A FILE IS — one served-type table, one kind table, one image test
// (shared/attachments.ts), and one tree order (shared/tree.ts).
//
// Before these, server/api.ts and the pocket served `.ico`, `.tif`, `.mkv` and
// `.txt` differently, six regexes disagreed about which extensions are
// pictures, and the pocket's tree sorted by a different collation.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { attachmentKindOf, contentTypeFor, isImagePath, MIME_TYPES } from "../shared/attachments.ts";
import { localIsoDay } from "../shared/dates.ts";
import { compareTreeNodes, sortTree } from "../shared/tree.ts";
import type { TreeNode } from "../shared/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("contentTypeFor", () => {
  it("serves what the vault holds", () => {
    assert.equal(contentTypeFor("a/b.PNG"), "image/png");
    assert.equal(contentTypeFor("x.ico"), "image/x-icon");
    assert.equal(contentTypeFor("book.epub"), "application/epub+zip");
    assert.equal(contentTypeFor("clip.mkv"), "video/x-matroska");
    assert.equal(contentTypeFor("notes.txt"), "text/plain; charset=utf-8");
    assert.equal(contentTypeFor("board.canvas"), "application/json");
    assert.equal(contentTypeFor("mystery.xyz"), "application/octet-stream");
    assert.equal(contentTypeFor("no-extension"), "application/octet-stream");
    assert.equal(contentTypeFor(".hidden"), "application/octet-stream");
  });
  it("covers every uploadable type", () => {
    for (const ext of ["png", "jpg", "heic", "pdf", "mp3", "opus", "m4v", "webm"]) {
      assert.ok(MIME_TYPES[ext], ext);
    }
  });
});

describe("isImagePath — the one image test", () => {
  it("is what a page can draw", () => {
    for (const p of ["a.png", "a.JPG", "a.jpeg", "a.gif", "a.webp", "a.avif", "a.svg", "a.bmp", "a.ico"]) assert.ok(isImagePath(p), p);
    for (const p of ["a.tif", "a.heic", "a.pdf", "png", "a.png.md", "folder/"]) assert.ok(!isImagePath(p), p);
  });
  it("is the only image-extension regex in the code", () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    for (const d of ["client", "server", "shared", "mobile/src"]) walk(path.join(root, d));
    const copies = files
      .filter((f) => !f.endsWith("shared/attachments.ts"))
      .filter((f) => /\/\\\.\((?:\?:)?[a-z|?]*(?:png|jpe\?g)[a-z|?]*\)/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f));
    assert.deepEqual(copies, [], "use isImagePath from shared/attachments.ts");
  });
});

describe("attachmentKindOf", () => {
  it("marks the tree's rows", () => {
    assert.equal(attachmentKindOf("a.tif"), "image");
    assert.equal(attachmentKindOf("a.heic"), "image");
    assert.equal(attachmentKindOf("a.epub"), "book");
    assert.equal(attachmentKindOf("a.opus"), "audio");
    assert.equal(attachmentKindOf("a.m4v"), "video");
    assert.equal(attachmentKindOf("a.zip"), "other");
  });
});

describe("the tree's order", () => {
  const n = (name: string, type: "file" | "folder" = "file", attachment = false): TreeNode =>
    ({ name, path: name, type, ...(attachment ? { attachment: { kind: "other", ext: "", size: 0 } } : {}) }) as TreeNode;
  it("folders, then notes, then attachments; case and accents do not split a band", () => {
    const root: TreeNode = {
      name: "",
      path: "",
      type: "folder",
      children: [n("zeta.pdf", "file", true), n("Zeta.md"), n("alpha.md"), n("Étude.md"), n("etude.md"), n("b", "folder"), n("A", "folder")],
    };
    sortTree(root);
    assert.deepEqual(root.children?.map((c) => c.name).slice(0, 3), ["A", "b", "alpha.md"]);
    assert.equal(root.children?.at(-1)?.name, "zeta.pdf");
  });
  it("breaks a base-sensitivity tie the same way everywhere", () => {
    assert.ok(compareTreeNodes(n("Etude.md"), n("etude.md")) !== 0);
    assert.equal(Math.sign(compareTreeNodes(n("Etude.md"), n("etude.md"))), -Math.sign(compareTreeNodes(n("etude.md"), n("Etude.md"))));
  });
});

describe("localIsoDay", () => {
  it("is the LOCAL day, in Western digits", () => {
    assert.equal(localIsoDay(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
    assert.equal(localIsoDay(new Date(2026, 11, 31, 0, 1).getTime()), "2026-12-31");
    assert.match(localIsoDay(), /^\d{4}-\d{2}-\d{2}$/);
  });
  it("is the only hand-rolled YYYY-MM-DD in the code", () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    for (const d of ["client", "server", "shared", "mobile/src"]) walk(path.join(root, d));
    const copies = files
      .filter((f) => !f.endsWith("shared/dates.ts"))
      .filter((f) => /\$\{\w+\.getFullYear\(\)\}-\$\{/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f));
    assert.deepEqual(copies, [], "use localIsoDay from shared/dates.ts");
  });
});
