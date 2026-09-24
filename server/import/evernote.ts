// EVERNOTE: an .enex export (docs/import.md).
//
// An .enex is one XML document: `<en-export>` holding `<note>`s, each with a
// `<title>`, its `<content>` (an ENML document — XHTML in `<en-note>` —
// inside CDATA), `<created>`/`<updated>` stamps (`20260920T083000Z`), its
// `<tag>`s, a `<note-attributes>` block (the source URL of a web clip), and
// its `<resource>`s: the images and files it embeds, base64 in `<data>`, each
// named by the MD5 of its bytes, which is how the content points at it
// (`<en-media hash="…">`).
//
// Each note becomes a note named by its title, its words through the
// clipper's converter (shared/htmlToMarkdown.ts), its tags `tags:`, its
// creation day `created:`, its web address `source:`, and each resource an
// attachment embedded where the `<en-media>` stood (`![[name]]`). A to-do
// (`<en-todo checked="true"/>`) is a Markdown task.

import { createHash } from "node:crypto";
import { ATTACHMENT_TYPES, extensionOf } from "../../shared/attachments.ts";
import { cleanName, cleanTag, type FrontValue } from "../../shared/importPlan.ts";
import { htmlToMarkdown } from "../../shared/htmlToMarkdown.ts";
import { childrenNamed, isElement, parseXml, type XmlElement } from "../epubXml.ts";
import { VaultError } from "../vault.ts";
import { emptyStats, text, type Converted, type ExportFile } from "./common.ts";

const MIME_EXT: Record<string, string> = Object.fromEntries(Object.entries(ATTACHMENT_TYPES).map(([ext, mime]) => [mime, ext]).reverse());
MIME_EXT["image/jpeg"] = "jpg";

function plain(el: XmlElement | undefined): string {
  if (!el) return "";
  let out = "";
  const walk = (n: XmlElement): void => {
    for (const c of n.children) {
      if (isElement(c)) walk(c);
      else out += c.text;
    }
  };
  walk(el);
  return out.trim();
}

function child(el: XmlElement, name: string): XmlElement | undefined {
  return childrenNamed(el, name)[0];
}

/** `20260920T083000Z` → `2026-09-20`. */
export function enexDate(stamp: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})T/.exec(stamp.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** A token the converter carries through as plain letters, swapped for the
 *  embed once the Markdown is made. */
const token = (i: number): string => `ASTROLABEENMEDIA${i}X`;

export function convertEvernote(files: ExportFile[]): Converted {
  const out: Converted = { notes: [], attachments: [], skipped: [], stats: emptyStats() };
  const usedNames = new Set<string>();
  for (const f of files) {
    if (extensionOf(f.path) !== "enex") {
      out.skipped.push({ path: f.path, reason: "unsupported" });
      continue;
    }
    const root = parseXml(text(f.bytes));
    if (!root || root.name !== "en-export") throw new VaultError(400, `${f.path} is not an Evernote export`, "importNotEnex");
    childrenNamed(root, "note").forEach((note, n) => {
      const title = plain(child(note, "title")) || "Untitled";
      const source = `${f.path}#${n + 1}`;
      // Resources by hash.
      const media = new Map<string, string>();
      for (const res of childrenNamed(note, "resource")) {
        const dataEl = child(res, "data");
        const b64 = plain(dataEl).replace(/\s+/g, "");
        if (b64 === "") continue;
        const bytes = new Uint8Array(Buffer.from(b64, "base64"));
        const hash = createHash("md5").update(bytes).digest("hex");
        const mime = plain(child(res, "mime")).toLowerCase();
        const attrs = child(res, "resource-attributes");
        const given = attrs ? plain(child(attrs, "file-name")) : "";
        const ext = extensionOf(given) || MIME_EXT[mime] || "";
        if (!Object.prototype.hasOwnProperty.call(ATTACHMENT_TYPES, ext)) {
          out.skipped.push({ path: `${source} ${given || hash}`, reason: "unsupported" });
          continue;
        }
        let name = cleanName(given || `${hash.slice(0, 12)}.${ext}`, `${hash.slice(0, 12)}.${ext}`);
        if (!name.toLowerCase().endsWith(`.${ext}`)) name = `${name}.${ext}`;
        // Two resources named alike in one export are two files.
        for (let i = 2; usedNames.has(name.toLowerCase()); i++) name = name.replace(/(?: \d+)?(\.[^.]+)$/, ` ${i}$1`);
        usedNames.add(name.toLowerCase());
        media.set(hash, name);
        out.attachments.push({ source: `${source}/${name}`, name, bytes });
      }
      // ENML → HTML the converter reads: en-media to a token, en-todo to a box.
      const enml = plain(child(note, "content"));
      const tokens: string[] = [];
      const html = enml
        .replace(/<\?xml[^>]*\?>|<!DOCTYPE[^>]*>/gi, "")
        .replace(/<en-media\b[^>]*\bhash="([0-9a-f]+)"[^>]*\/?>(?:<\/en-media>)?/gi, (_w, hash: string) => {
          const name = media.get(hash.toLowerCase());
          if (!name) return "";
          tokens.push(name);
          return ` ${token(tokens.length - 1)} `;
        })
        .replace(/<en-todo\b[^>]*checked="true"[^>]*\/?>/gi, "[x] ")
        .replace(/<en-todo\b[^>]*\/?>/gi, "[ ] ")
        .replace(/<\/?en-note[^>]*>/gi, "");
      let body = htmlToMarkdown(html);
      tokens.forEach((name, i) => {
        body = body.replace(token(i), `![[${name}]]`);
      });
      // A to-do the converter escaped (`\[ \]`) back into a task.
      body = body.replace(/^\\\[( |x)\\\] /gm, "- [$1] ");
      const fields: Array<[string, FrontValue]> = [];
      const tags = childrenNamed(note, "tag").map((t) => cleanTag(plain(t))).filter(Boolean);
      const created = enexDate(plain(child(note, "created")));
      const updated = enexDate(plain(child(note, "updated")));
      const attrs = child(note, "note-attributes");
      const url = attrs ? plain(child(attrs, "source-url")) : "";
      if (tags.length > 0) fields.push(["tags", tags]);
      if (created) fields.push(["created", created]);
      if (updated && updated !== created) fields.push(["updated", updated]);
      if (/^https?:\/\//i.test(url)) fields.push(["source", url]);
      out.stats.properties += fields.length;
      out.stats.tags += tags.length > 0 ? 1 : 0;
      out.stats.created += created ? 1 : 0;
      out.notes.push({ source, dir: "", want: `${cleanName(title)}.md`, title, body, fields });
    });
  }
  return out;
}
