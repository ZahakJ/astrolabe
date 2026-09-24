// OBSIDIAN: a vault folder, zipped or picked as a folder (docs/import.md).
//
// An Obsidian vault is already this vault's kind of thing — Markdown files,
// `[[wikilinks]]`, YAML frontmatter, `![[embeds]]` — so the notes come over
// as they are: their folders kept under the import's folder, their
// frontmatter kept (aliases, tags, every property) byte for byte, with ONE
// exception. Obsidian Publish marks a note public with `publish: true`, and
// the same key publishes a note here; an import publishes nothing, so that
// line is taken out and counted.
//
// What moves is the attachments: every image, PDF and recording goes to the
// folder this vault's attachment setting names for the note's new home, and
// the planner renames the embeds and re-resolves the Markdown destinations
// that pointed at them (server/moveLinks.ts). `.obsidian/` (the app's own
// settings), `.trash/` and anything that is neither a note nor an attachment
// stay behind, listed.

import { ATTACHMENT_TYPES, extensionOf } from "../../shared/attachments.ts";
import { cleanDir, cleanName } from "../../shared/importPlan.ts";
import { readFrontmatter, setFrontmatterLine } from "../publish.ts";
import { baseOf, dirOf, emptyStats, isSystemFile, text, type Converted, type ExportFile } from "./common.ts";

export function convertObsidian(files: ExportFile[]): Converted {
  const out: Converted = { notes: [], attachments: [], skipped: [], stats: emptyStats() };
  for (const f of files) {
    if (isSystemFile(f.path) || f.path.startsWith(".obsidian/") || f.path.startsWith(".trash/") || f.path.split("/").some((s) => s.startsWith("."))) {
      out.skipped.push({ path: f.path, reason: "system" });
      continue;
    }
    const ext = extensionOf(f.path);
    if (ext === "md") {
      let raw = text(f.bytes).replace(/\r\n/g, "\n");
      const fm = readFrontmatter(raw);
      if (fm.publish !== undefined) {
        raw = setFrontmatterLine(raw, "publish", null);
        out.stats.publishCleared++;
      }
      const keys = Object.keys(fm).filter((k) => k !== "publish");
      out.stats.properties += keys.length;
      if (keys.some((k) => /^tags?$/i.test(k))) out.stats.tags++;
      if (keys.some((k) => /^(aliases|alias)$/i.test(k))) out.stats.aliases++;
      if (keys.some((k) => /^created$/i.test(k))) out.stats.created++;
      const dir = cleanDir(dirOf(f.path));
      const name = cleanName(baseOf(f.path).replace(/\.md$/i, ""));
      out.notes.push({ source: f.path, dir: dirOf(f.path), want: `${dir === "" ? "" : `${dir}/`}${name}.md`, title: null, body: raw, fields: null });
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(ATTACHMENT_TYPES, ext)) {
      out.attachments.push({ source: f.path, name: cleanName(baseOf(f.path), "file"), bytes: f.bytes });
      continue;
    }
    out.skipped.push({ path: f.path, reason: "unsupported" });
  }
  return out;
}
