// Every minor release ships a "What's new" deck.
//
//   node scripts/check-whatsnew.mjs
//
// The owner: "whenever you update to a new version and open that version for
// the first time you get a popup with a preview of all the features added in
// said update" — and, on the discipline: "you need to somehow remind future
// sessions to make sure to create a new preview with every major change",
// and "we prob shouldn't change it for bug fixes". So the rule is mechanical:
//
//   · package.json at x.Y.0 (a MINOR bump) must appear in
//     client/whatsnew/versions.ts AND have an entry in
//     client/whatsnew/releaseNotes.ts with at least one slide;
//   · a patch (x.Y.z, z > 0) needs nothing — it inherits its minor's deck,
//     and a reader who skipped x.Y.0 still gets it;
//   · every slide's title and body carry BOTH languages, non-empty.
//
// A version bump without a deck fails the build here, which is the reminder.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(root + p, "utf8");

const version = JSON.parse(read("package.json")).version;
const [major, minor, patch] = version.split(".").map(Number);
const minorVersion = `${major}.${minor}.0`;

const versions = read("client/whatsnew/versions.ts");
const notes = read("client/whatsnew/releaseNotes.ts");
const errs = [];

const listed = [...versions.matchAll(/"(\d+\.\d+\.\d+)"/g)].map((m) => m[1]);
if (!listed.includes(minorVersion)) {
  errs.push(`  ${minorVersion} is not in client/whatsnew/versions.ts RELEASE_VERSIONS`);
}
for (const v of listed) {
  if (!v.endsWith(".0")) errs.push(`  ${v} in versions.ts is a patch — decks belong to minor versions (x.Y.0) only`);
  if (!new RegExp(`version:\\s*"${v.replace(/\./g, "\\.")}"`).test(notes)) {
    errs.push(`  ${v} is listed but client/whatsnew/releaseNotes.ts has no entry for it`);
  }
}
// Every entry in the notes must be listed, and every slide bilingual.
const entries = [...notes.matchAll(/version:\s*"(\d+\.\d+\.\d+)"/g)].map((m) => m[1]);
for (const v of entries) if (!listed.includes(v)) errs.push(`  releaseNotes.ts has ${v} but versions.ts does not list it`);
const slideTitles = [...notes.matchAll(/title:\s*\{\s*en:\s*"([^"]*)",\s*ar:\s*"([^"]*)",?\s*\}/g)];
const bodies = [...notes.matchAll(/body:\s*\{\s*en:\s*"([^"]*)",\s*ar:\s*"([^"]*)",?\s*\}/g)];
for (const m of [...slideTitles, ...bodies]) {
  if (m[1].trim() === "" || m[2].trim() === "") errs.push(`  a slide string is empty in one language: "${m[1]}" / "${m[2]}"`);
  if (!/[؀-ۿ]/.test(m[2])) errs.push(`  the Arabic half is not Arabic: "${m[2]}"`);
}
const registrySlides = (notes.match(/visual:\s*\{\s*kind:/g) ?? []).length;
if (registrySlides === 0) errs.push("  releaseNotes.ts has no slides at all");

if (errs.length > 0) {
  console.error(`check-whatsnew: package.json is ${version}${patch > 0 ? ` (patch of ${minorVersion})` : ""}\n${errs.join("\n")}\n  → add the release to client/whatsnew/versions.ts and a deck to client/whatsnew/releaseNotes.ts`);
  process.exit(1);
}
console.log(`check-whatsnew: ${version} → deck ${minorVersion} · ${listed.length} releases · ${bodies.length} slides bilingual`);
console.log("WHATSNEW OK");
