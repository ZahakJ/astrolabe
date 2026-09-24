// The importer (server/deckImport.ts) and the ZIP reader under it
// (server/zip.ts): an Anki package BUILT HERE — a real SQLite collection
// written with node:sqlite, zipped with headers written by hand — goes in,
// and the deck notes the spec describes come out, byte for byte.
//
// The archive is written by this file and not by shared/zip.ts on purpose:
// a reader tested only against our own writer would prove the two agree,
// not that either matches the format. The hand-written builder deflates
// its entries (Anki's do) and puts every size in the local header (Anki's
// do); shared/zip.ts stores and uses a data descriptor, and a second test
// feeds the reader that shape too, so both halves of the format get read.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";
import { crc32, zipSync } from "../shared/zip.ts";
import { scanCards } from "../shared/cards.ts";
import { listZip, readZipEntry, zipIndex, ZipError } from "../server/zip.ts";
import {
  ankiSchedule,
  clozeAsQa,
  clozeLine,
  clozeOrdinals,
  clozeReadable,
  csvDeck,
  fieldText,
  looksLikeHeader,
  mediaNamesFromProto,
  noteBaseName,
  parseDelimited,
  readApkg,
  serialiseImportedDeck,
  Skips,
  writeDecks,
  type ImportDeck,
} from "../server/deckImport.ts";
import { initIndexer } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

// ── A ZIP writer of the OTHER kind: deflate, sizes up front ─────────────

function le16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function le32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/** An archive with deflated entries and no data descriptor — the shape
 *  Anki (and `zip`) write. Names are UTF-8 with bit 11 set. */
function zipDeflated(entries: Array<{ name: string; data: Uint8Array; store?: boolean }>): Uint8Array {
  const parts: number[] = [];
  const central: number[] = [];
  for (const entry of entries) {
    const name = [...enc.encode(entry.name)];
    const packed = entry.store ? entry.data : new Uint8Array(deflateRawSync(entry.data));
    const crc = crc32(entry.data);
    const offset = parts.length;
    const method = entry.store ? 0 : 8;
    parts.push(
      ...le32(0x04034b50), ...le16(20), ...le16(1 << 11), ...le16(method), ...le16(0), ...le16(0x21),
      ...le32(crc), ...le32(packed.length), ...le32(entry.data.length), ...le16(name.length), ...le16(0),
      ...name, ...packed,
    );
    central.push(
      ...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(1 << 11), ...le16(method), ...le16(0), ...le16(0x21),
      ...le32(crc), ...le32(packed.length), ...le32(entry.data.length), ...le16(name.length), ...le16(0), ...le16(0),
      ...le16(0), ...le16(0), ...le32(0), ...le32(offset), ...name,
    );
  }
  const dirAt = parts.length;
  const end = [
    ...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(entries.length), ...le16(entries.length),
    ...le32(central.length), ...le32(dirAt), ...le16(0),
  ];
  return new Uint8Array([...parts, ...central, ...end]);
}

describe("server/zip.ts — the reader", () => {
  it("reads deflated entries written with sizes in the local header", () => {
    const text = enc.encode("سلام ".repeat(200));
    const bytes = zipDeflated([
      { name: "ملاحظة.txt", data: text },
      { name: "raw.bin", data: new Uint8Array([1, 2, 3, 4]), store: true },
    ]);
    const entries = listZip(bytes);
    assert.deepEqual(entries.map((e) => [e.name, e.method, e.size]), [["ملاحظة.txt", 8, text.length], ["raw.bin", 0, 4]]);
    assert.ok(entries[0].compressedSize < text.length, "the text was actually deflated");
    assert.equal(dec.decode(readZipEntry(bytes, entries[0])), "سلام ".repeat(200));
    assert.deepEqual([...readZipEntry(bytes, entries[1])], [1, 2, 3, 4]);
  });

  it("reads our own writer's stored entries, whose local header carries no CRC", () => {
    const bytes = zipSync([{ name: "a/b.md", data: enc.encode("# hi\n") }]);
    const index = zipIndex(bytes);
    assert.equal(dec.decode(readZipEntry(bytes, index.get("a/b.md")!)), "# hi\n");
  });

  it("finds the end record behind an archive comment and refuses what is not a zip", () => {
    const plain = zipDeflated([{ name: "x", data: enc.encode("x") }]);
    const commented = new Uint8Array([...plain.subarray(0, plain.length - 2), ...le16(9), ...enc.encode("PK\x05\x06xxxxx")]);
    assert.equal(listZip(commented).length, 1);
    assert.throws(() => listZip(enc.encode("not a zip at all, but long enough to search")), ZipError);
  });

  it("names an unsupported method rather than returning garbage", () => {
    const bytes = zipDeflated([{ name: "x", data: enc.encode("x") }]);
    const entry = { ...listZip(bytes)[0], method: 12 };
    assert.throws(() => readZipEntry(bytes, entry), /method 12/);
  });
});

// ── Field text, cloze, schedule: the pure pieces ─────────────────────────

describe("fieldText", () => {
  it("turns Anki's HTML into one line of the vault's Markdown", () => {
    assert.equal(fieldText("cat<br>&amp; kitten<div>on a mat</div>"), "cat & kitten on a mat");
    assert.equal(fieldText('<img src="cat.png"> a cat [sound:meow.mp3]'), "![[cat.png]] a cat ![[meow.mp3]]");
    assert.equal(fieldText("<b>bold</b> &lt;tag&gt; &#x1F431; &#65;"), "bold <tag> 🐱 A");
    assert.equal(fieldText("[$]x^2[/$] and [$$]\\int[/$$]"), "$x^2$ and $$\\int$$");
    assert.equal(fieldText('<img src="https://example.org/a.png">'), "![](https://example.org/a.png)");
  });
});

describe("cloze", () => {
  const text = "The speed of light is {{c1::299,792 km/s}} in {{c2::vacuum::medium}}.";
  it("lists the deletions once each, in order", () => {
    assert.deepEqual(clozeOrdinals(text), [1, 2]);
    assert.deepEqual(clozeOrdinals("{{c2::a}} {{c1::b}} {{c2::c}}"), [2, 1]);
  });
  it("marks one deletion as a highlight and shows the rest plain, hints dropped", () => {
    assert.equal(clozeLine(text, 1), "The speed of light is ==299,792 km/s== in vacuum.");
    assert.equal(clozeLine(text, 2), "The speed of light is 299,792 km/s in ==vacuum==.");
  });
  it("keeps a `::` in the text from becoming a card separator", () => {
    assert.equal(clozeLine("{{c1::x}} in std::vector", 1), "==x== in std: :vector");
    // Every colon that touches another, not every pair: `:::` softened
    // pairwise left `: ::`, and the scanner split the line there.
    assert.equal(clozeLine("{{c1::x}} a:::b", 1), "==x== a: : :b");
    assert.deepEqual(scanCards("==x== a: : :b\n").map((c) => c.kind), ["cloze"]);
  });
  it("turns a deletion the vault cannot highlight into a plain card, so nothing is lost", () => {
    const eq = "Einstein: {{c1::E = mc²}} in {{c2::1905}}";
    assert.ok(!clozeReadable(eq, 1), "an `=` inside `==…==` is no highlight to shared/cards.ts");
    assert.ok(clozeReadable(eq, 2));
    assert.deepEqual(clozeAsQa(eq, 1), { front: "Einstein: **[…]** in 1905", back: "E = mc²" });
    assert.ok(!clozeReadable(`{{c1::${"x".repeat(201)}}}`, 1), "a highlight is at most 200 characters");
    assert.ok(!clozeReadable("{{c1::}} empty", 1));
    // Two deletions with one number are one card with two answers.
    assert.deepEqual(clozeAsQa("{{c1::a=1}} and {{c1::b=2}}", 1), { front: "**[…]** and **[…]**", back: "a=1 · b=2" });
  });
});

describe("ankiSchedule", () => {
  const crt = Math.floor(new Date(2024, 0, 1, 4).getTime() / 1000);
  const base = { queue: 2, odue: 0, odid: 0, ivl: 4, factor: 2500 };
  it("gives a new card no schedule", () => {
    assert.equal(ankiSchedule({ ...base, type: 0, queue: 0, due: 3 }, { crt }), null);
  });
  it("counts a review card's due in days from the collection's creation day", () => {
    assert.deepEqual(ankiSchedule({ ...base, type: 2, due: 10 }, { crt }), { due: "2024-01-11", interval: 4, ease: 2500 });
  });
  it("reads a learning card's due as seconds and gives it a day", () => {
    const due = Math.floor(new Date(2024, 1, 1, 10).getTime() / 1000);
    assert.deepEqual(ankiSchedule({ ...base, type: 1, queue: 1, due, ivl: 0, factor: 0 }, { crt }), { due: "2024-02-01", interval: 1, ease: 2500 });
  });
  it("uses the original due of a card parked in a filtered deck, and floors the ease", () => {
    assert.deepEqual(ankiSchedule({ ...base, type: 2, due: -100000, odue: 2, odid: 99, factor: 1100 }, { crt }), { due: "2024-01-03", interval: 4, ease: 1300 });
  });
});

describe("mediaNamesFromProto", () => {
  it("reads the names out of a recent export's media index", () => {
    // MediaEntries{ entries: [ {name:"a.png", size: 3}, {name:"b.mp3"} ] }
    const entry = (name: string, extra: number[] = []): number[] => {
      const n = [...enc.encode(name)];
      const body = [0x0a, n.length, ...n, ...extra];
      return [0x0a, body.length, ...body];
    };
    const bytes = new Uint8Array([...entry("a.png", [0x10, 3]), ...entry("b.mp3")]);
    assert.deepEqual(mediaNamesFromProto(bytes), ["a.png", "b.mp3"]);
  });
});

// ── CSV ──────────────────────────────────────────────────────────────────

describe("CSV / TSV", () => {
  it("parses quoted fields, embedded newlines and a BOM, and picks the delimiter", () => {
    const { rows, delimiter } = parseDelimited('﻿a,"b, c","say ""hi""\nthere"\n\nd,e,f\r\n');
    assert.equal(delimiter, ",");
    assert.deepEqual(rows, [["a", "b, c", 'say "hi"\nthere'], ["d", "e", "f"]]);
    assert.deepEqual(parseDelimited("x\ty\nz\tw").rows, [["x", "y"], ["z", "w"]]);
  });
  it("honours Anki's #separator directive and skips the others", () => {
    const { rows, delimiter } = parseDelimited("#separator:semicolon\n#html:true\n#tags column:3\na;b;t1 t2\n");
    assert.equal(delimiter, ";");
    assert.deepEqual(rows, [["a", "b", "t1 t2"]]);
  });
  it("tells a header row from a first card", () => {
    assert.ok(looksLikeHeader(["Front", "Back", "Tags"]));
    assert.ok(!looksLikeHeader(["cat", "gato"]));
    assert.ok(!looksLikeHeader(["What is 2+2?", "4"]));
  });
  it("keeps a front that begins like Markdown structure a card, and reads every line back", () => {
    const skips = new Skips();
    const csv = [
      "# of legs on a spider,8",
      "```js,a fence would swallow every card after it",
      "> quoted,q",
      "| pipe,p",
      "- [ ] task,t",
      "a:::b,c",
      "東京：首都,Tokyo",
      "plain,card",
      "x,y,",
    ].join("\r\n");
    const deck = csvDeck(csv, { title: "Edges", front: 0, back: 1, extra: 2, tags: null, header: null }, skips);
    const text = serialiseImportedDeck(deck);
    const cards = scanCards(text);
    assert.equal(cards.length, 9, text);
    assert.deepEqual(cards.map((c) => c.front), ["\\# of legs on a spider", "\\```js", "\\> quoted", "\\| pipe", "\\- [ ] task", "a: : :b", "東京：首都", "plain", "x"]);
    assert.deepEqual(cards.map((c) => c.back), ["8", "a fence would swallow every card after it", "q", "p", "t", "c", "Tokyo", "card", "y"]);
    assert.deepEqual(skips.list(), []);
    // An empty third column is no `::extra`.
    assert.ok(text.endsWith("\nx::y\n"), text);
  });

  it("maps columns by index, drops empty rows, keeps tags", () => {
    const skips = new Skips();
    const deck = csvDeck("Term,Definition,Example,Tags\ncat,gato,el gato,animals\n,empty,,\ndog,perro,,animals pets", { title: "Spanish", front: 0, back: 1, extra: 2, tags: 3, header: null }, skips);
    assert.deepEqual(
      deck.cards.map((c) => [c.front, c.back, c.extra, c.tags]),
      [["cat", "gato", "el gato", ["animals"]], ["dog", "perro", null, ["animals", "pets"]]],
    );
    assert.deepEqual(skips.list(), [{ reason: "empty", count: 1 }]);
    assert.equal(
      serialiseImportedDeck(deck),
      "---\ntitle: Spanish\n---\n\n```deck\ntitle: Spanish\nkind: basic\n```\n\ncat::gato::el gato #animals\ndog::perro #animals #pets\n",
    );
  });
});

describe("serialiseImportedDeck", () => {
  it("writes sections as headings and quotes a title YAML would misread", () => {
    const deck: ImportDeck = {
      title: "Physics: Light",
      cards: [
        { kind: "qa", front: "c", back: "speed of light", extra: null, tags: [], section: null, schedule: null, reverse: null },
        { kind: "reversed", front: "ν", back: "frequency", extra: "Hz", tags: [], section: "Waves", schedule: { due: "2024-01-05", interval: 2, ease: 2400 }, reverse: null },
        { kind: "cloze", front: "==Light== is a wave", back: "", extra: null, tags: ["opt"], section: "Waves", schedule: null, reverse: null },
      ],
    };
    assert.equal(
      serialiseImportedDeck(deck),
      [
        "---", 'title: "Physics: Light"', "---", "", "```deck", "title: Physics: Light", "kind: basic", "```", "",
        "c::speed of light", "", "## Waves", "",
        "ν:::frequency::Hz <!--SR:!2024-01-05,2,2400!2024-01-05,2,2400-->",
        "==Light== is a wave #opt", "",
      ].join("\n"),
    );
    // A title the caller typed with a newline and a fence in it stays one line, and the fence stays whole.
    // A newline folds; the backticks stay (one line cannot open a fence),
    // and YAML gets them quoted.
    const odd = serialiseImportedDeck({ title: "Two\nlines ```", cards: [] });
    assert.ok(odd.startsWith("---\ntitle: \"Two lines ```\"\n---\n\n```deck\ntitle: Two lines ```\nkind: basic\n```\n"), odd);
    assert.equal(noteBaseName("A/B: C?"), "A B C");
    assert.equal(noteBaseName("///"), "Imported deck");
  });
});

// ── The whole thing: an .apkg built here, notes written there ────────────

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);

/** The collection as SQLite bytes: schema 11, the shape every export with
 *  "support older Anki versions" carries. */
async function buildCollection(): Promise<Uint8Array> {
  const { DatabaseSync } = await import("node:sqlite");
  const file = path.join(makeDir(), "collection.anki21");
  const db = new DatabaseSync(file);
  db.exec(`
    create table col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
    create table notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text);
    create table cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);
  `);
  const crt = Math.floor(new Date(2024, 0, 1, 4).getTime() / 1000);
  const models = {
    1: { name: "Basic", type: 0, flds: [{ name: "Front", ord: 0 }, { name: "Back", ord: 1 }], tmpls: [{ name: "Card 1", ord: 0 }] },
    2: { name: "Basic (and reversed card)", type: 0, flds: [{ name: "Front", ord: 0 }, { name: "Back", ord: 1 }], tmpls: [{ name: "Card 1", ord: 0 }, { name: "Card 2", ord: 1 }] },
    3: { name: "Cloze", type: 1, flds: [{ name: "Text", ord: 0 }, { name: "Back Extra", ord: 1 }], tmpls: [{ name: "Cloze", ord: 0 }] },
    4: { name: "Vocab", type: 0, flds: [{ name: "Front", ord: 0 }, { name: "Back", ord: 1 }, { name: "Example", ord: 2 }], tmpls: [{ name: "Card 1", ord: 0 }] },
    5: { name: "Basic (optional reversed card)", type: 0, flds: [{ name: "Front", ord: 0 }, { name: "Back", ord: 1 }, { name: "Add Reverse", ord: 2 }], tmpls: [{ name: "Card 1", ord: 0 }, { name: "Card 2", ord: 1 }] },
  };
  const decks = { 1: { name: "Default" }, 10: { name: "Japanese" }, 11: { name: "Japanese::Lesson 1" }, 12: { name: "Physics" } };
  db.prepare("insert into col values (1, ?, 0, 0, 11, 0, 0, 0, '{}', ?, ?, '{}', '{}')").run(crt, JSON.stringify(models), JSON.stringify(decks));
  const note = db.prepare("insert into notes values (?, ?, ?, 0, 0, ?, ?, '', 0, 0, '')");
  const card = db.prepare("insert into cards values (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, 0, '')");
  const learningDue = Math.floor(new Date(2024, 1, 1, 10).getTime() / 1000);
  // id, guid, mid, tags, flds
  note.run(1, "g1", 1, " animals ", "猫<br>\x1fcat &amp; kitten");
  note.run(2, "g2", 2, "", "犬\x1fdog");
  note.run(3, "g3", 3, "", "The speed of light is {{c1::299,792 km/s}} in {{c2::vacuum::medium}}.\x1fextra");
  note.run(4, "g4", 4, "", '<img src="cat.png">\x1f[sound:meow.mp3] a cat\x1fExample: <b>neko</b>');
  note.run(5, "g5", 1, "", "hidden\x1fsuspended");
  note.run(6, "g6", 1, "", "学ぶ\x1fto learn");
  note.run(7, "g7", 5, "", "鳥\x1fbird\x1fy");
  note.run(8, "g8", 3, "", "Einstein: {{c1::E = mc²}} in {{c2::1905}}\x1f");
  note.run(9, "g9", 1, "", "# of legs on a spider\x1f8");
  // id, nid, did, ord, type, queue, due, ivl, factor, odue, odid
  card.run(101, 1, 10, 0, 2, 2, 10, 4, 2500, 0, 0);
  card.run(102, 2, 10, 0, 0, 0, 5, 0, 0, 0, 0);
  card.run(103, 2, 10, 1, 2, 2, 3, 1, 2300, 0, 0);
  card.run(104, 3, 12, 0, 0, 0, 6, 0, 0, 0, 0);
  card.run(105, 3, 12, 1, 2, 2, 20, 7, 2650, 0, 0);
  card.run(106, 4, 11, 0, 0, 0, 7, 0, 0, 0, 0);
  card.run(107, 5, 10, 0, 2, -1, 2, 3, 2500, 0, 0);
  card.run(108, 6, 10, 0, 1, 1, learningDue, 0, 0, 0, 0);
  card.run(109, 7, 10, 0, 0, 0, 8, 0, 0, 0, 0);
  card.run(110, 7, 10, 1, 0, 0, 8, 0, 0, 0, 0);
  card.run(111, 8, 12, 0, 0, 0, 9, 0, 0, 0, 0);
  card.run(112, 8, 12, 1, 0, 0, 9, 0, 0, 0, 0);
  card.run(113, 9, 12, 0, 0, 0, 10, 0, 0, 0, 0);
  db.close();
  return new Uint8Array(readFileSync(file));
}

/** A real SQLite file with none of Anki's tables. */
async function emptyDb(): Promise<Uint8Array> {
  const { DatabaseSync } = await import("node:sqlite");
  const file = path.join(makeDir(), "empty.sqlite");
  const db = new DatabaseSync(file);
  db.exec("create table t (x)");
  db.close();
  return new Uint8Array(readFileSync(file));
}

async function buildApkg(): Promise<Uint8Array> {
  return zipDeflated([
    { name: "collection.anki21", data: await buildCollection() },
    { name: "collection.anki2", data: enc.encode("stub") },
    { name: "media", data: enc.encode(JSON.stringify({ "0": "cat.png", "1": "meow.mp3", "2": "unused.png", "3": "font.ttf" })) },
    { name: "0", data: PNG },
    { name: "1", data: MP3 },
    { name: "2", data: PNG },
    { name: "3", data: new Uint8Array([0, 1, 0, 0]) },
  ]);
}

const JAPANESE = [
  "---", "title: Japanese", "---", "", "```deck", "title: Japanese", "kind: basic", "```", "",
  "猫::cat & kitten #animals <!--SR:!2024-01-11,4,2500-->",
  "犬:::dog <!--SR:!2024-01-04,1,2300!2024-01-04,1,2300-->",
  "学ぶ::to learn <!--SR:!2024-02-01,1,2500-->",
  "鳥:::bird",
  "", "## Lesson 1", "",
  "![[cat.png]]::![[meow.mp3]] a cat::Example: neko", "",
].join("\n");

const PHYSICS = [
  "---", "title: Physics", "---", "", "```deck", "title: Physics", "kind: basic", "```", "",
  "The speed of light is ==299,792 km/s== in vacuum.", "",
  "The speed of light is 299,792 km/s in ==vacuum==.", "<!--SR:!2024-01-21,7,2650-->", "",
  "Einstein: **[…]** in 1905::E = mc²",
  "Einstein: E = mc² in ==1905==", "",
  "\\# of legs on a spider::8", "",
].join("\n");

describe("the .apkg importer", () => {
  const data = makeDir();
  const root = makeVault({ "Orbits/Physics.md": "an older note with the deck's name\n" });
  let apkg: Uint8Array;

  before(async () => {
    initSite({ ASTROLABE_DATA: data });
    initVault(root);
    await initIndexer();
    apkg = await buildApkg();
  });
  after(() => {
    removeVault(root);
    removeVault(data);
  });

  it("reads the collection into decks: basic, reversed, cloze, subdeck sections, a suspended skip", async () => {
    const skips = new Skips();
    const { decks, media } = await readApkg(apkg, path.join(data, "tmp"), skips);
    assert.deepEqual(decks.map((d) => d.title), ["Japanese", "Physics"]);
    assert.deepEqual(decks[0].cards.map((c) => [c.kind, c.section]), [["qa", null], ["reversed", null], ["qa", null], ["reversed", null], ["qa", "Lesson 1"]]);
    assert.equal(decks[0].cards[3].extra, null, "Add Reverse's \"y\" is a switch, not an extra");
    assert.deepEqual(decks[1].cards.map((c) => c.kind), ["cloze", "cloze", "qa", "cloze", "qa"]);
    assert.deepEqual([...media.keys()], ["cat.png", "meow.mp3", "unused.png", "font.ttf"]);
    assert.deepEqual(skips.list(), [{ reason: "suspended", count: 1 }]);
    assert.deepEqual(decks[0].cards[1].reverse, { due: "2024-01-04", interval: 1, ease: 2300 });
    assert.equal(decks[0].cards[1].schedule, null, "the forward card is new");
  });

  it("writes one note per deck in the spec's shape, media beside it, a taken name stepped", async () => {
    const skips = new Skips();
    const contents = await readApkg(apkg, path.join(data, "tmp"), skips);
    const result = await writeDecks(contents.decks, { folder: "" }, contents.media, apkg, skips);
    assert.deepEqual(result.created, ["Orbits/Japanese.md", "Orbits/Physics 2.md"]);
    assert.equal(result.cards, 12, "stars, not lines: the two `:::` pairs count twice");
    assert.deepEqual(result.skipped, [{ reason: "suspended", count: 1 }]);
    assert.equal(readFileSync(path.join(root, "Orbits/Japanese.md"), "utf8"), JAPANESE);
    assert.equal(readFileSync(path.join(root, "Orbits/Physics 2.md"), "utf8"), PHYSICS);
    assert.equal(readFileSync(path.join(root, "Orbits/Physics.md"), "utf8"), "an older note with the deck's name\n");
    // Only the media the cards mention is copied, into the attachments folder.
    assert.ok(existsSync(path.join(root, "Attachments/cat.png")));
    assert.ok(existsSync(path.join(root, "Attachments/meow.mp3")));
    assert.ok(!existsSync(path.join(root, "Attachments/unused.png")));
    assert.ok(!existsSync(path.join(root, "Attachments/font.ttf")));
    assert.ok(!existsSync(path.join(data, "tmp", "collection.sqlite")), "the unpacked collection is gone");
    // The vault's own scanner reads the result: the schedules survived the trip.
    const cards = scanCards(JAPANESE);
    assert.deepEqual(cards[0].schedule, { due: "2024-01-11", interval: 4, ease: 2500 });
    assert.equal(cards[0].front, "猫");
    const physics = scanCards(PHYSICS);
    assert.deepEqual(physics.map((c) => [c.kind, c.back, c.schedule?.due ?? null]), [
      ["cloze", "299,792 km/s", null],
      ["cloze", "vacuum", "2024-01-21"],
      ["qa", "E = mc²", null],
      ["cloze", "1905", null],
      ["qa", "8", null],
    ]);
  });

  it("reuses a media file already there with the same bytes and steps one that differs", async () => {
    const skips = new Skips();
    const contents = await readApkg(apkg, path.join(data, "tmp"), skips);
    const deck: ImportDeck = { title: "Again", cards: [{ kind: "qa", front: "![[cat.png]]", back: "![[meow.mp3]]", extra: null, tags: [], section: null, schedule: null, reverse: null }] };
    // Same bytes as before for cat.png; different bytes for meow.mp3.
    contents.media.set("meow.mp3", { entry: contents.media.get("unused.png")!.entry, compressed: false });
    const result = await writeDecks([deck], { folder: "Decks" }, contents.media, apkg, skips);
    assert.deepEqual(result.created, ["Decks/Again.md"]);
    const text = readFileSync(path.join(root, "Decks/Again.md"), "utf8");
    assert.ok(text.endsWith("![[cat.png]]::![[meow-2.mp3]]\n"), text);
    assert.ok(existsSync(path.join(root, "Attachments/meow-2.mp3")));
  });

  it("reads a recent Anki's export: zstd collection, protobuf media index, zstd media", async () => {
    const { zstdCompressSync } = await import("node:zlib");
    const z = (bytes: Uint8Array): Uint8Array => new Uint8Array(zstdCompressSync(bytes));
    const name = [...enc.encode("cat.png")];
    const entry = [0x0a, name.length, ...name];
    const proto = new Uint8Array([0x0a, entry.length, ...entry]);
    const modern = zipDeflated([
      { name: "collection.anki21b", data: z(await buildCollection()) },
      { name: "collection.anki2", data: enc.encode("stub") },
      { name: "media", data: z(proto) },
      { name: "0", data: z(PNG) },
    ]);
    const skips = new Skips();
    const contents = await readApkg(modern, path.join(data, "tmp"), skips);
    assert.deepEqual(contents.decks.map((d) => [d.title, d.cards.length]), [["Japanese", 5], ["Physics", 5]]);
    assert.deepEqual([...contents.media.keys()], ["cat.png"]);
    const result = await writeDecks(contents.decks, { folder: "Modern" }, contents.media, modern, skips);
    assert.deepEqual(result.created, ["Modern/Japanese.md", "Modern/Physics.md"]);
    assert.deepEqual(new Uint8Array(readFileSync(path.join(root, "Attachments/cat.png"))), PNG);
    assert.deepEqual(result.skipped, [{ reason: "suspended", count: 1 }, { reason: "mediaMissing", count: 1 }]);
  });

  it("refuses an archive that is no Anki package, and a collection that is no database", async () => {
    const skips = new Skips();
    await assert.rejects(readApkg(zipDeflated([{ name: "readme.txt", data: enc.encode("hi") }]), path.join(data, "tmp"), skips), /no collection/);
    await assert.rejects(
      readApkg(zipDeflated([{ name: "collection.anki2", data: enc.encode("not sqlite at all, just text") }]), path.join(data, "tmp"), skips),
      (err: unknown) => (err as { status: number; code: string }).status === 400 && (err as { code: string }).code === "orbitsImportNotApkg",
    );
    await assert.rejects(
      readApkg(zipDeflated([{ name: "collection.anki2", data: await emptyDb() }]), path.join(data, "tmp"), skips),
      (err: unknown) => (err as { status: number }).status === 400,
    );
  });
});
