// THE PERFORMANCE FIXTURE — one vault, built from a seed, that every timing
// in `npm run check-perf` is measured on.
//
// A performance number is only a number if the thing measured is the same
// thing next week. The owner's vault is not that: it grows, it is private,
// and a server must never be pointed at it. So the fixture is GENERATED, from
// a fixed seed, with the shapes that actually cost something here:
//
//   • 2,000 notes across 40 folders, each with frontmatter properties, a
//     handful of `[[wikilinks]]` and inline `#tags` — the tree, the graph,
//     the tags shelf and the search index all scale off this one number.
//   • a 3,000-line note — the editor's worst honest case, and the only way to
//     see whether a keystroke costs O(1) or O(document).
//   • a note with 50 `![[embeds]]`, which is 50 more documents the editor has
//     to resolve and render inside the one you are typing in.
//
// AND NOTHING ELSE, unless it is asked for by name. A real book and real
// `Sigils/` and `Orbits/` notes can be folded in — the reader and the two
// shelves have more to draw with them — but only when `ASTROLABE_SEED_VAULT`
// points at a vault to take them from. It used to default to the owner's own,
// which gave away both halves of the bargain at once: a gate that starts an
// unauthenticated server would have been starting it over the owner's real
// notes, and the fixture's numbers would have been a property of one laptop
// rather than of the fixture. They measurably were — the generated vault
// carries 110 distinct tags everywhere, and 121 on the machine this was
// written on, which is not a number anyone else could reproduce.
//
// Nothing here reads a network and nothing writes outside the directory it is
// given. The build is idempotent: a `.perf-fixture` stamp naming the shape
// means the vault is already the right one, so a second run costs nothing.
// The stamp covers the SEED MATERIAL TOO — its paths, sizes and mtimes — so a
// reused vault cannot quietly hold last week's copy of a folder that moved.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/** Bumped whenever the generated shape changes, so a stale vault is rebuilt. */
export const FIXTURE_VERSION = 4;

export const FIXTURE_NOTES = 2000;
export const FIXTURE_FOLDERS = 40;
export const LONG_NOTE_LINES = 3000;
export const EMBED_COUNT = 50;

/** Generated sigils, each with most of a year of log under it, in their own
 *  folder (not `Sigils/`, which a seed vault may fill). */
export const FIXTURE_SIGILS = 12;
export const SIGIL_FOLDER = "Practice";

export const LONG_NOTE = "Long note.md";
export const EMBED_NOTE = "Fifty embeds.md";
export const BOOK_REL = "Library/Classical Mechanics (Goldstein).pdf";

/** Where real material is taken from, when there is to be any. OPT-IN, with
 *  no default: a gate that reaches into a vault nobody named is a gate that
 *  serves somebody's private notes off an unauthenticated port, and a budget
 *  built over a folder that grows is a budget only one machine can meet. The
 *  fixture is a fixture without it, and every timing that wanted a book or a
 *  shelf says so rather than inventing one. */
const SEED_VAULT = process.env.ASTROLABE_SEED_VAULT || null;

/** A deterministic 32-bit PRNG (mulberry32). `Math.random()` would make every
 *  run measure a different vault, which is the one thing a budget cannot
 *  survive. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FOLDER_WORDS = [
  "Atoms", "Bearings", "Cadence", "Datum", "Ephemeris", "Facets", "Gnomon", "Horizon",
  "Inclination", "Jetsam", "Kernels", "Latitude", "Meridian", "Nadir", "Obliquity", "Parallax",
  "Quadrant", "Rete", "Sextant", "Tympan", "Umbra", "Vernier", "Wedge", "Xebec",
  "Yardarm", "Zenith", "Almucantar", "Bezel", "Chord", "Declination", "Equant", "Fiducial",
  "Gimbal", "Halyard", "Index", "Jacob", "Kamal", "Limb", "Mater", "Nocturnal",
];

// A shelf of a dozen tags proves nothing: the tag tree's cost is in the number
// of DISTINCT tags, and a real vault of this size carries a hundred and more.
// Sixteen roots and ten leaves under each reach 110 distinct tags here — not
// the 160 the multiplication promises, because the three slots below are all
// derived from `i` and so cannot land in every combination. Counted, not
// multiplied: `/api/tags` over the generated vault answers 110.
const TAG_ROOTS = [
  "reading", "craft", "field", "ledger", "letters", "optics", "sea", "sky",
  "brass", "charts", "drift", "errata", "glass", "harbour", "index", "journal",
];
const TAG_LEAVES = ["draft", "done", "open", "seed", "note", "proof", "sketch", "review", "idle", "warm"];
const STATUS = ["seed", "draft", "working", "settled"];
const INSTRUMENTS = ["alidade", "quadrant", "sextant", "nocturnal", "astrolabe"];
const OBSERVERS = ["al-Bīrūnī", "Hypatia", "Brahe", "Maskelyne", "Kepler"];

const PROSE = [
  "The instrument answers the hand before it answers the sky.",
  "A measurement that cannot be repeated is a story about a morning.",
  "Brass expands; the rule that ignores it is wrong by noon.",
  "What the rete hides, the alidade finds, and slowly.",
  "Every table here was copied from another table, once.",
  "The sea moves under the reading, not the reading over the sea.",
  "Two observers, one star, and a disagreement worth writing down.",
  "A sight taken in haste is a sight taken twice.",
];

/** The fixture's own shape, hashed — the stamp that says a rebuild is not
 *  needed. `seed` is the signature of whatever real material is being folded
 *  in, so "the same shape" also means "the same book and the same shelves":
 *  a stamp that recorded only WHETHER a folder was copied would keep serving
 *  last month's copy of one that has since been written in. */
function shapeStamp(seed) {
  const parts = [FIXTURE_VERSION, FIXTURE_NOTES, FIXTURE_FOLDERS, LONG_NOTE_LINES, EMBED_COUNT, seed];
  return createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 16);
}

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Every file under `from`, as `relative path · size · mtime` lines — the
 *  cheapest honest answer to "is this still the same folder?". Stat only: the
 *  seed material is opt-in and may be a book, and hashing a 30 MB PDF on
 *  every run to learn what its mtime already says is a rebuild's worth of
 *  work for nothing. */
async function signDir(from, prefix, out) {
  for (const entry of (await fs.readdir(from, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    const src = path.join(from, entry.name);
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await signDir(src, rel, out);
    else if (entry.isFile()) {
      const st = await fs.stat(src);
      out.push(`${rel}·${st.size}·${Math.round(st.mtimeMs)}`);
    }
  }
}

/** Copy a directory the way `cp -r` would, with no dependency on `cp`. */
async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDir(src, dst);
    else if (entry.isFile()) await fs.copyFile(src, dst);
  }
}

/** The name of note `i`, stable across runs — the harness types into
 *  `Meridian/Meridian 07` by name, not by whatever the tree happened to sort
 *  first. */
export function fixtureNoteName(i) {
  const folder = FOLDER_WORDS[i % FIXTURE_FOLDERS];
  const n = String(Math.floor(i / FIXTURE_FOLDERS) + 1).padStart(2, "0");
  return `${folder}/${folder} ${n}`;
}

function noteBody(i, rand) {
  const name = fixtureNoteName(i);
  const title = name.slice(name.indexOf("/") + 1);
  const tags = [];
  const root = TAG_ROOTS[i % TAG_ROOTS.length];
  tags.push(`${root}/${TAG_LEAVES[(i >> 3) % TAG_LEAVES.length]}`);
  tags.push(TAG_ROOTS[(i * 7) % TAG_ROOTS.length]);
  tags.push(`${TAG_ROOTS[(i * 11 + 3) % TAG_ROOTS.length]}/${TAG_LEAVES[(i * 5) % TAG_LEAVES.length]}`);
  // Five links out, spread far enough that the graph is a web rather than a
  // chain: a note linking only to its neighbours lays out in a line, and a
  // line is the cheapest graph there is.
  const links = [];
  for (let k = 0; k < 5; k++) {
    const target = (i * 31 + k * 397 + 11) % FIXTURE_NOTES;
    if (target !== i) links.push(fixtureNoteName(target));
  }
  const lines = [];
  lines.push("---");
  lines.push(`title: "${title}"`);
  lines.push(`tags: [${tags.join(", ")}]`);
  lines.push(`status: ${STATUS[i % STATUS.length]}`);
  lines.push(`rating: ${1 + (i % 5)}`);
  lines.push(`date: 2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`);
  lines.push(`instrument: ${INSTRUMENTS[i % INSTRUMENTS.length]}`);
  lines.push(`observer: "${OBSERVERS[(i * 3) % OBSERVERS.length]}"`);
  lines.push(`confidence: ${(0.5 + (i % 50) / 100).toFixed(2)}`);
  lines.push(`source: ${FOLDER_WORDS[(i * 13) % FIXTURE_FOLDERS]}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(PROSE[i % PROSE.length]);
  lines.push("");
  lines.push(`Filed under #${tags[0]} and #${tags[1]}.`);
  lines.push("");
  lines.push("## Bearings");
  lines.push("");
  for (const target of links) lines.push(`- [[${target}]]`);
  lines.push("");
  lines.push(PROSE[(i * 3 + 1) % PROSE.length]);
  lines.push("");
  lines.push("| Reading | Error |");
  lines.push("| --- | --- |");
  lines.push(`| ${(rand() * 90).toFixed(2)}° | ${(rand() * 3).toFixed(2)}′ |`);
  lines.push(`| ${(rand() * 90).toFixed(2)}° | ${(rand() * 3).toFixed(2)}′ |`);
  lines.push("");
  return lines.join("\n") + "\n";
}

function longNote() {
  const rand = rng(99);
  const lines = ["---", 'title: "Long note"', "tags: [ledger/proof, sea]", "status: working", "---", "", "# Long note", ""];
  for (let i = 0; i < LONG_NOTE_LINES; i++) {
    const n = i + 1;
    if (n % 120 === 0) lines.push("", `## Section ${n / 120}`, "");
    // …modulo the vault, so every link RESOLVES. A note full of broken links
    // measures the miss path and nothing else, and the miss path is not what
    // a reader's note is made of.
    else if (n % 17 === 0) lines.push(`- [[${fixtureNoteName((n * 13) % FIXTURE_NOTES)}]] — ${PROSE[n % PROSE.length]}`);
    else if (n % 23 === 0) lines.push(`> ${PROSE[(n * 5) % PROSE.length]}`);
    else if (n % 31 === 0) lines.push("`" + `sight(${n}) = ${(rand() * 90).toFixed(3)}` + "`" + " — and the rest follows.");
    else lines.push(`${PROSE[n % PROSE.length]} Line ${n} of the ledger, with #${TAG_ROOTS[n % TAG_ROOTS.length]} in it.`);
  }
  return lines.join("\n") + "\n";
}

/** A year of daily notes, so the Calendar page has a month with something in
 *  every cell rather than an empty grid — an empty month costs nothing to
 *  draw, and a timing taken on it is a timing of the wrong page. */
function dailyNotes() {
  const out = [];
  const start = Date.UTC(2026, 0, 1);
  for (let d = 0; d < 365; d++) {
    const day = new Date(start + d * 86400000);
    const name = day.toISOString().slice(0, 10);
    const lines = [
      "---",
      `title: "${name}"`,
      `tags: [journal/${TAG_LEAVES[d % TAG_LEAVES.length]}]`,
      "---",
      "",
      `# ${name}`,
      "",
      PROSE[d % PROSE.length],
      "",
      `- [ ] ${PROSE[(d * 3) % PROSE.length]}`,
      `- [x] Read [[${fixtureNoteName((d * 7) % FIXTURE_NOTES)}]]`,
      "",
    ];
    out.push([`daily/${name}.md`, lines.join("\n") + "\n"]);
  }
  return out;
}

/** A dozen sigils with a log line for most days of 2026 up to September, so
 *  the Sigils page draws twelve full cards (streaks, heatmaps, the week) and
 *  the Calendar page has bands and ticks on every day — an empty shelf costs
 *  nothing to draw, and a timing taken on it would be a timing of the wrong
 *  page. The same shape the New sigil form writes (docs/sigils.md). */
const SIGIL_KINDS = ["exercise", "study", "reading", "practice"];
const SIGIL_ICONS = ["🚶", "🗻", "📖", "🎹", "🧘", "✍️"];
function sigilNotes() {
  const out = [];
  const start = Date.UTC(2026, 0, 1);
  for (let s = 0; s < FIXTURE_SIGILS; s++) {
    const title = `Practice ${s + 1}`;
    const lines = [
      "```sigil",
      `title: ${title}`,
      `kind: ${SIGIL_KINDS[s % SIGIL_KINDS.length]}`,
      `icon: ${SIGIL_ICONS[s % SIGIL_ICONS.length]}`,
      "slots: morning, evening",
      `target: ${4 + (s % 3)}/week`,
      "monday:",
      `  morning: ${PROSE[s % PROSE.length].slice(0, 40)}`,
      "  evening: twenty minutes",
      "wednesday:",
      "  morning: the long session",
      "saturday:",
      "  morning: the week's review",
      "```",
      "",
      "```sigil-log",
    ];
    for (let d = 0; d < 262; d++) {
      // Most days, not every day: misses are what a streak and a heatmap draw.
      if ((d * (s + 3)) % 7 === 0) continue;
      const day = new Date(start + d * 86400000).toISOString().slice(0, 10);
      const done = d % 3 === 0 ? "morning" : "morning, evening";
      lines.push(`${day} | done: ${done}${d % 11 === 0 ? " | " + PROSE[(d + s) % PROSE.length].slice(0, 30) : ""}`);
    }
    lines.push("```", "");
    out.push([`${SIGIL_FOLDER}/${title}.md`, lines.join("\n")]);
  }
  return out;
}

function embedNote() {
  const lines = ["---", 'title: "Fifty embeds"', "tags: [ledger/review]", "---", "", "# Fifty embeds", ""];
  for (let i = 0; i < EMBED_COUNT; i++) {
    lines.push(`## ${i + 1}`, "", `![[${fixtureNoteName((i * 37 + 5) % FIXTURE_NOTES)}]]`, "");
  }
  return lines.join("\n") + "\n";
}

/**
 * Build (or confirm) the fixture vault at `dir`. Returns what it contains, so
 * a caller can skip the timings whose material is missing rather than report
 * a zero.
 */
export async function buildFixtureVault(dir, { quiet = false } = {}) {
  // No `ASTROLABE_SEED_VAULT`, no real material and no look at anyone's disk:
  // the generated vault is the whole fixture, and it is the same one on every
  // machine.
  const bookSrc = SEED_VAULT && path.join(SEED_VAULT, BOOK_REL.slice(BOOK_REL.indexOf("/") + 1));
  const bookFrom = SEED_VAULT && path.join(SEED_VAULT, "Library", path.basename(BOOK_REL));
  const withBook = !SEED_VAULT ? null : (await exists(bookFrom)) ? bookFrom : (await exists(bookSrc)) ? bookSrc : null;
  const shelves = [];
  if (SEED_VAULT) {
    for (const name of ["Sigils", "Orbits"]) {
      if (await exists(path.join(SEED_VAULT, name))) shelves.push(name);
    }
  }
  // What was actually copied, not merely whether something was: see shapeStamp.
  const seed = [];
  if (withBook) {
    const st = await fs.stat(withBook);
    seed.push(`book·${st.size}·${Math.round(st.mtimeMs)}`);
  }
  for (const name of shelves) await signDir(path.join(SEED_VAULT, name), name, seed);
  const stamp = shapeStamp(seed.join("\n"));
  const stampFile = path.join(dir, ".perf-fixture");
  if (await exists(stampFile)) {
    const found = (await fs.readFile(stampFile, "utf8")).trim();
    if (found === stamp) {
      if (!quiet) console.log(`perf fixture: reusing ${dir} (${FIXTURE_NOTES} notes, stamp ${stamp})`);
      return { dir, notes: FIXTURE_NOTES, book: Boolean(withBook), shelves, reused: true };
    }
  }

  await fs.mkdir(dir, { recursive: true });
  const rand = rng(20260919);
  for (let f = 0; f < FIXTURE_FOLDERS; f++) {
    await fs.mkdir(path.join(dir, FOLDER_WORDS[f]), { recursive: true });
  }
  // Write in batches so 2,000 opens do not all race at once — the point is a
  // vault on disk, not a benchmark of the filesystem.
  const BATCH = 100;
  for (let i = 0; i < FIXTURE_NOTES; i += BATCH) {
    await Promise.all(
      Array.from({ length: Math.min(BATCH, FIXTURE_NOTES - i) }, (_, k) => {
        const idx = i + k;
        return fs.writeFile(path.join(dir, `${fixtureNoteName(idx)}.md`), noteBody(idx, rand), "utf8");
      }),
    );
  }
  await fs.writeFile(path.join(dir, LONG_NOTE), longNote(), "utf8");
  await fs.writeFile(path.join(dir, EMBED_NOTE), embedNote(), "utf8");
  await fs.mkdir(path.join(dir, "daily"), { recursive: true });
  for (const [rel, body] of dailyNotes()) await fs.writeFile(path.join(dir, rel), body, "utf8");
  await fs.mkdir(path.join(dir, SIGIL_FOLDER), { recursive: true });
  for (const [rel, body] of sigilNotes()) await fs.writeFile(path.join(dir, rel), body, "utf8");

  if (withBook) {
    await fs.mkdir(path.join(dir, "Library"), { recursive: true });
    await fs.copyFile(withBook, path.join(dir, BOOK_REL));
  }
  for (const name of shelves) await copyDir(path.join(SEED_VAULT, name), path.join(dir, name));

  await fs.writeFile(stampFile, stamp + "\n", "utf8");
  if (!quiet) {
    console.log(
      `perf fixture: built ${dir} — ${FIXTURE_NOTES} notes in ${FIXTURE_FOLDERS} folders, ` +
        `a ${LONG_NOTE_LINES}-line note, ${EMBED_COUNT} embeds, ${FIXTURE_SIGILS} sigils` +
        (withBook ? ", the 665-page book" : SEED_VAULT ? ", no book in the seed vault" : "") +
        (shelves.length ? `, ${shelves.join(" + ")}` : "") +
        (SEED_VAULT ? ` (seeded from ${SEED_VAULT})` : " — generated only"),
    );
  }
  return { dir, notes: FIXTURE_NOTES, book: Boolean(withBook), shelves, reused: false };
}

// Runnable on its own: `node scripts/perf-fixture.mjs <dir>`, with an optional
// `ASTROLABE_SEED_VAULT=<vault>` to fold a real book and real shelves in.
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scripts/perf-fixture.mjs <vault-dir>");
    process.exit(1);
  }
  await buildFixtureVault(path.resolve(dir));
}
