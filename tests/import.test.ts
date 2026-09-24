// The import wizard (docs/import.md): the pure half (shared/importPlan.ts),
// each converter against a hand-written export of its kind under
// tests/fixtures/import, and the whole preview → commit → undo loop over a
// throwaway vault — collisions resolved out loud, attachments moved into the
// vault's attachments folder with the links that named them rewritten, and no
// imported note public.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanName, frontmatterBlock, linksToWikilinks, normaliseFields, notionDate, notionProperties, renameEmbeds, resolveTargets, stripNotionId } from "../shared/importPlan.ts";
import { zipSync } from "../shared/zip.ts";
import { dropCommonRoot, unzipExport, type ExportFile } from "../server/import/common.ts";
import { convertEvernote } from "../server/import/evernote.ts";
import { convertNotion } from "../server/import/notion.ts";
import { convertObsidian } from "../server/import/obsidian.ts";
import { commitImport, planImport, undoImport } from "../server/import/plan.ts";
import { initIndexer, isNotePublished, noteTitle } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "import");

/** Every file under a fixture folder, as the export's own paths. */
function readTree(root: string, prefix = ""): ExportFile[] {
  const out: ExportFile[] = [];
  for (const name of readdirSync(path.join(root, prefix))) {
    const rel = prefix === "" ? name : `${prefix}/${name}`;
    if (statSync(path.join(root, rel)).isDirectory()) out.push(...readTree(root, rel));
    else out.push({ path: rel, bytes: new Uint8Array(readFileSync(path.join(root, rel))) });
  }
  return out;
}

/** The fixture folder as the zip its app would have written. */
function zipOf(dir: string): Uint8Array {
  return zipSync(readTree(dir).map((f) => ({ name: f.path, data: f.bytes })));
}

const notionFiles = (): ExportFile[] => unzipExport(zipOf(path.join(FIX, "notion")));
const enexFiles = (): ExportFile[] => [{ path: "Reading notes.enex", bytes: new Uint8Array(readFileSync(path.join(FIX, "evernote", "Reading notes.enex"))) }];
const obsidianFiles = (): ExportFile[] => dropCommonRoot(readTree(path.join(FIX, "obsidian")));

describe("the pure half (shared/importPlan.ts)", () => {
  it("strips Notion's ids and cleans names", () => {
    assert.equal(stripNotionId("Reading list 0f8e2b7c4d1a4e6b9c3d2e1f0a9b8c7d.md"), "Reading list.md");
    assert.equal(stripNotionId("Books 3a4b5c6d7e8f40a1b2c3d4e5f6a7b8c9"), "Books");
    assert.equal(stripNotionId("Plain name"), "Plain name");
    assert.equal(cleanName("  a/b: [c] #d?  "), "a b c d");
    assert.equal(cleanName("..."), "Untitled");
  });

  it("resolves collisions against the vault and within the export, never overwriting", () => {
    const { targets, collisions } = resolveTargets(
      [
        { source: "a", path: "In/Notes.md" },
        { source: "b", path: "In/notes.md" },
        { source: "c", path: "In/Welcome.md" },
      ],
      (p) => p === "In/Welcome.md",
    );
    assert.deepEqual([...targets.values()], ["In/Notes.md", "In/notes 2.md", "In/Welcome 2.md"]);
    assert.deepEqual(collisions.map((c) => [c.source, c.reason]), [["b", "duplicate"], ["c", "exists"]]);
  });

  it("reads Notion's property lines, and leaves a sentence with a colon in the body", () => {
    const p = notionProperties("# Book\n\nAuthor: Someone\nTags: a, b c\nStarted: September 10, 2026\n\nBody: prose.\n");
    assert.equal(p.title, "Book");
    assert.deepEqual(p.fields, [["Author", "Someone"], ["Tags", ["a", "b-c"]], ["Started", "2026-09-10"]]);
    assert.equal(p.body, "Body: prose.\n");
    const q = notionProperties("# Page\n\nNote: this is a sentence\nand it goes on.\n");
    assert.deepEqual(q.fields, []);
    assert.match(q.body, /^Note: this is a sentence/);
    assert.equal(notionDate("September 9, 2026 7:15 PM"), "2026-09-09");
  });

  it("normalises keys, drops publish, and writes frontmatter YAML reads back", () => {
    const f = normaliseFields([["Tags", "x, y"], ["Created", "2026-01-02"], ["publish", true], ["Status", "Reading: now"], ["Alias", "Z"]]);
    assert.deepEqual(f, [["tags", ["x", "y"]], ["created", "2026-01-02"], ["Status", "Reading: now"], ["aliases", "Z"]]);
    assert.equal(frontmatterBlock(f), '---\ntags: [x, y]\ncreated: 2026-01-02\nStatus: "Reading: now"\naliases: Z\n---\n');
  });

  it("rewrites links between imported notes into wikilinks, and renames embeds", () => {
    const { text, count } = linksToWikilinks("See [the list](../Reading%20list%20abc.md#Top) and [web](https://x.org) and ![i](a.png).", "Sub", (p) => (p === "Reading list abc.md" ? "In/Reading list.md" : null));
    assert.equal(text, "See [[Reading list#Top|the list]] and [web](https://x.org) and ![i](a.png).");
    assert.equal(count, 1);
    const r = renameEmbeds("![[a.png]] ![[Attachments/b.png|200]] [[Note]]", new Map([["a.png", "a 2.png"], ["Attachments/b.png", "b.png"]]));
    assert.equal(r.text, "![[a 2.png]] ![[b.png|200]] [[Note]]");
    assert.equal(r.count, 2);
  });
});

describe("the converters, each against a real-shaped export", () => {
  it("Notion: ids gone, properties to frontmatter, the database a table, rows given the CSV's cells", () => {
    const c = convertNotion(notionFiles());
    const by = new Map(c.notes.map((n) => [n.want, n]));
    assert.deepEqual(c.notes.map((n) => n.want).sort(), [
      "Books.md",
      "Books/Invisible Cities.md",
      "Books/The Muqaddimah.md",
      "Colophon.md",
      "Notes.md",
      "Notes.md",
      "Reading list.md",
      "Reading list/Why read slowly.md",
    ].sort());
    const muq = by.get("Books/The Muqaddimah.md")!;
    assert.deepEqual(muq.fields, [["Author", "Ibn Khaldun"], ["Status", "Reading"], ["tags", ["history", "sociology"]], ["Started", "2026-09-10"], ["created", "2026-09-09"]]);
    assert.match(muq.body, /^Asabiyya: the group feeling/);
    // A row page with no property lines borrows them from the database.
    assert.deepEqual(by.get("Books/Invisible Cities.md")!.fields, [["Author", "Italo Calvino"], ["Status", "Done"], ["tags", ["fiction"]], ["Started", "2026-08-02"]]);
    assert.match(by.get("Books.md")!.body, /^\| Name \| Author \| Status \| Tags \| Started \|\n\| --- /);
    // The HTML page: its property table, its body only.
    const col = by.get("Colophon.md")!;
    assert.deepEqual(col.fields, [["tags", ["meta", "site"]], ["created", "2026-09-01"]]);
    assert.match(col.body, /^Set in \*\*Lora\*\*\. Built from \[the reading list\]\(\/Reading%20list/);
    assert.deepEqual(c.attachments.map((a) => a.name), ["cover.svg"]);
  });

  it("Evernote: title, tags, created and source to frontmatter; resources to attachments where they stood; to-dos to tasks", () => {
    const c = convertEvernote(enexFiles());
    assert.deepEqual(c.notes.map((n) => n.want), ["Muqaddimah — chapter one.md", "Welcome.md", "ملاحظة عربية.md"]);
    const [first, , ar] = c.notes;
    assert.deepEqual(first.fields, [["tags", ["history", "ibn-khaldun"]], ["created", "2026-09-10"], ["updated", "2026-09-12"], ["source", "https://example.org/muqaddimah/1"]]);
    assert.match(first.body, /Asabiyya is the \*\*group feeling\*\* that founds a dynasty\./);
    assert.match(first.body, /- \[x\] Read the prolegomena/);
    assert.match(first.body, /- \[ \] Compare with Machiavelli/);
    assert.match(first.body, /!\[\[map\.png\]\]/);
    assert.match(first.body, /The scan: !\[\[e4a37a595b9d\.pdf\]\]/);
    assert.deepEqual(c.attachments.map((a) => [a.name, a.bytes.length > 0]), [["map.png", true], ["e4a37a595b9d.pdf", true]]);
    assert.deepEqual(ar.fields, [["tags", ["عربي"]], ["created", "2026-09-15"]]);
  });

  it("Obsidian: notes as they are, publish taken out, .obsidian and the unknown left behind", () => {
    const c = convertObsidian(obsidianFiles());
    assert.deepEqual(c.notes.map((n) => n.want).sort(), ["Index.md", "Projects/Plan.md", "Seedlings.md"]);
    const index = c.notes.find((n) => n.want === "Index.md")!;
    assert.match(index.body, /^---\naliases: \[Home, Start here\]\ntags: \[garden, index\]\n---\n/);
    assert.doesNotMatch(index.body, /publish/);
    assert.equal(c.stats.publishCleared, 1);
    assert.equal(c.stats.aliases, 1);
    assert.deepEqual(c.attachments.map((a) => a.source), ["Attachments/diagram.svg"]);
    assert.deepEqual(c.skipped.map((s) => [s.path, s.reason]).sort(), [[".obsidian/app.json", "system"], ["Attachments/Welcome.png.txt", "unsupported"]]);
  });
});

describe("preview → commit → undo, over a vault", () => {
  const data = makeDir();
  let root = "";

  before(async () => {
    root = makeVault({
      "Welcome.md": "# Welcome\n",
      "Attachments/diagram.svg": "<svg xmlns='http://www.w3.org/2000/svg'><!-- the vault's own, different --></svg>\n",
      "Garden/Seedlings.md": "# Already here\n",
    });
    initSite({ ASTROLABE_DATA: data });
    initVault(root);
    await initIndexer();
  });

  after(() => {
    removeVault(root);
    removeVault(data);
  });

  it("Notion: the preview counts and writes nothing; the commit writes the plan; links become wikilinks", async () => {
    const preview = planImport("notion", notionFiles(), "Imported");
    assert.equal(preview.notes, 8);
    assert.equal(preview.attachments, 1);
    assert.equal(preview.attachmentsFolder, "Attachments");
    assert.deepEqual(preview.collisions.map((c) => [c.wanted, c.target, c.reason]), [["Imported/Notes.md", "Imported/Notes 2.md", "duplicate"]]);
    assert.ok(preview.links >= 6, `links rewritten: ${preview.links}`);
    assert.ok(preview.frontmatter.properties >= 9);
    assert.ok(!existsSync(path.join(root, "Imported")), "the preview wrote nothing");

    const lines: string[] = [];
    const done = await commitImport(preview.planId, (p) => lines.push(p.type));
    assert.equal(done.notes.length, 8);
    assert.equal(lines.filter((l) => l === "progress").length, 9);
    assert.equal(lines.at(-1), "done");
    const read = (p: string): string => readFileSync(path.join(root, p), "utf8");
    const list = read("Imported/Reading list.md");
    assert.match(list, /^# Reading list\n\nWhat I am reading, and why\.\n/);
    assert.match(list, /- \[\[Why read slowly\]\]/);
    assert.match(list, /The shelf: \[\[Books\]\]/);
    assert.match(list, /\[a web page\]\(https:\/\/example\.org\/reading\)/);
    // The image re-resolved from the note's folder to the attachments folder.
    assert.match(list, /!\[cover\.svg\]\(\.\.\/Attachments\/cover\.svg\)/);
    assert.match(read("Imported/Reading list/Why read slowly.md"), /See \[\[Reading list\|the list\]\] and \[\[The Muqaddimah\]\]\./);
    assert.match(read("Imported/Books/The Muqaddimah.md"), /^---\nAuthor: Ibn Khaldun\nStatus: Reading\ntags: \[history, sociology\]\nStarted: 2026-09-10\ncreated: 2026-09-09\n---\n\n# The Muqaddimah\n/);
    assert.match(read("Imported/Books.md"), /\| \[\[The Muqaddimah\]\] \| Ibn Khaldun \|/);
    assert.match(read("Imported/Colophon.md"), /Built from \[\[Reading list\|the reading list\]\]/);
    assert.ok(existsSync(path.join(root, "Attachments/cover.svg")));
    assert.equal(noteTitle("Imported/Notes 2.md"), "Notes 2");
    for (const p of done.notes) assert.equal(isNotePublished(p), false, `${p} must not be public`);

    const undone = await undoImport(done.undoId);
    assert.equal(undone.removed.length, 9);
    assert.deepEqual(undone.kept, []);
    assert.ok(!existsSync(path.join(root, "Imported")), "the folders the import made are gone");
    assert.ok(!existsSync(path.join(root, "Attachments/cover.svg")));
    assert.ok(existsSync(path.join(root, "Attachments/diagram.svg")), "the vault's own file is untouched");
    await assert.rejects(undoImport(done.undoId), /can no longer be taken back/);
  });

  it("Evernote at the vault root: a note the vault has becomes Welcome 2, and nothing is public", async () => {
    const preview = planImport("evernote", enexFiles(), "");
    assert.deepEqual(preview.collisions.map((c) => [c.wanted, c.target, c.reason]), [["Welcome.md", "Welcome 2.md", "exists"]]);
    const done = await commitImport(preview.planId);
    assert.equal(readFileSync(path.join(root, "Welcome.md"), "utf8"), "# Welcome\n", "never overwritten");
    const first = readFileSync(path.join(root, "Muqaddimah — chapter one.md"), "utf8");
    assert.match(first, /^---\ntags: \[history, ibn-khaldun\]\ncreated: 2026-09-10\nupdated: 2026-09-12\nsource: "https:\/\/example\.org\/muqaddimah\/1"\n---\n\n# Muqaddimah — chapter one\n/);
    assert.ok(existsSync(path.join(root, "Attachments/map.png")));
    for (const p of done.notes) assert.equal(isNotePublished(p), false);
    // An edit after the import survives the undo, and is reported.
    writeFileSync(path.join(root, "Welcome 2.md"), "# Mine now\n");
    const undone = await undoImport(done.undoId);
    assert.deepEqual(undone.kept, ["Welcome 2.md"]);
    assert.equal(readFileSync(path.join(root, "Welcome 2.md"), "utf8"), "# Mine now\n");
    assert.ok(!existsSync(path.join(root, "Attachments/map.png")));
  });

  it("Obsidian: attachments into the attachments folder, renamed on a clash, embeds and paths rewritten; publish never lands", async () => {
    const preview = planImport("obsidian", obsidianFiles(), "Garden");
    assert.deepEqual(
      preview.collisions.map((c) => [c.wanted, c.target, c.reason]),
      [
        ["Garden/Seedlings.md", "Garden/Seedlings 2.md", "exists"],
        ["Attachments/diagram.svg", "Attachments/diagram 2.svg", "exists"],
      ],
    );
    assert.equal(preview.frontmatter.publishCleared, 1);
    const done = await commitImport(preview.planId);
    const index = readFileSync(path.join(root, "Garden/Index.md"), "utf8");
    assert.match(index, /^---\naliases: \[Home, Start here\]\ntags: \[garden, index\]\n---\n/);
    assert.match(index, /Projects: \[\[Garden\/Projects\/Plan\]\] and \[\[Seedlings 2\]\]\./);
    assert.match(index, /\n!\[\[diagram 2\.svg\]\]\n/);
    assert.match(index, /A path-form embed: !\[\[diagram 2\.svg\|200\]\]/);
    assert.match(index, /A Markdown image: !\[the diagram\]\(\.\.\/Attachments\/diagram%202\.svg\)/);
    assert.match(readFileSync(path.join(root, "Garden/Projects/Plan.md"), "utf8"), /See \[\[Index#The garden\]\] and \[\[Seedlings 2\|the seedlings\]\]\./);
    assert.match(readFileSync(path.join(root, "Garden/Seedlings 2.md"), "utf8"), /Back to \[\[Index\|the index\]\]\./);
    assert.equal(readFileSync(path.join(root, "Garden/Seedlings.md"), "utf8"), "# Already here\n");
    for (const p of done.notes) assert.equal(isNotePublished(p), false, `${p} must not be public`);
    const undone = await undoImport(done.undoId);
    assert.equal(undone.kept.length, 0);
    assert.ok(existsSync(path.join(root, "Garden/Seedlings.md")), "the folder that was there stays, with its note");
    assert.ok(!existsSync(path.join(root, "Garden/Projects")));
  });

  it("an expired or unknown plan is refused, and an export with no notes is refused at preview", async () => {
    await assert.rejects(commitImport("nope"), /expired/);
    assert.throws(() => planImport("obsidian", [{ path: "a.bin", bytes: new Uint8Array([1]) }], "X"), /no notes/);
  });
});
