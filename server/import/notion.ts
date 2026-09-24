// NOTION: the "Markdown & CSV" export, or the "HTML" one (docs/import.md).
//
// What Notion writes, and what becomes of it here:
//
//   · a PAGE is `Title <32-hex id>.md` (or `.html`), and its sub-pages and
//     files sit in a folder of the same name beside it. The id goes from
//     every name (`stripNotionId`), and the folder stays a folder.
//   · a page's PROPERTIES (a database row's Status, Tags, Created…) are the
//     lines right under its title in the Markdown export, and a
//     `<table class="properties">` in the HTML one. Both become frontmatter:
//     `Tags` → `tags:`, `Created` → `created:`, a Notion date ("September 20,
//     2026") → `2026-09-20`, and every other property under its own name.
//   · a DATABASE is `Name <id>.csv` beside a folder of its rows. The CSV
//     becomes a note of the same name holding the table, its first column
//     linked to the row notes; a row page that carried no property lines of
//     its own takes its row's cells from the CSV.
//   · LINKS between pages are relative, percent-encoded paths
//     (`[Sub](Page%20abc/Sub%20def.md)`); the planner rewrites them into
//     wikilinks by the final names. Files a page embeds are attachments.

import { ATTACHMENT_TYPES, extensionOf } from "../../shared/attachments.ts";
import { cleanDir, cleanName, cleanTag, normaliseFields, notionDate, notionProperties, stripNotionId, type FrontValue } from "../../shared/importPlan.ts";
import { htmlToMarkdown, parseHtml, type ElementNode, type Node } from "../../shared/htmlToMarkdown.ts";
import { parseDelimited } from "../deckImport.ts";
import { baseOf, dirOf, emptyStats, isSystemFile, text, type Converted, type ExportFile, type SourceNote } from "./common.ts";

/** What an HTML export's links resolve against while it is converted: a base
 *  that is never fetched, stripped back off to a rooted export path. */
const HTML_BASE = "https://notion-export.invalid/";

function wantOf(path: string, title: string | null): string {
  const dir = cleanDir(dirOf(path), stripNotionId);
  const own = stripNotionId(baseOf(path).replace(/\.(md|html?|csv)$/i, ""));
  const name = cleanName(own || title || "Untitled");
  return `${dir === "" ? "" : `${dir}/`}${name}.md`;
}

function textOf(node: Node): string {
  if (node.type === "text") return node.text;
  return node.children.map(textOf).join("");
}

function findAll(node: Node, test: (el: ElementNode) => boolean, out: ElementNode[] = []): ElementNode[] {
  if (node.type !== "el") return out;
  if (test(node)) out.push(node);
  for (const c of node.children) findAll(c, test, out);
  return out;
}

/** One HTML page: its title, its property table as fields, its body. */
function htmlPage(html: string, path: string): { title: string | null; fields: Array<[string, FrontValue]>; body: string } {
  const root = parseHtml(html);
  const titleEl = findAll(root, (el) => el.name === "h1" && /\bpage-title\b/.test(el.attrs.class ?? ""))[0] ?? findAll(root, (el) => el.name === "title")[0];
  const title = titleEl ? textOf(titleEl).replace(/\s+/g, " ").trim() || null : null;
  const fields: Array<[string, FrontValue]> = [];
  for (const table of findAll(root, (el) => el.name === "table" && /\bproperties\b/.test(el.attrs.class ?? ""))) {
    for (const tr of findAll(table, (el) => el.name === "tr")) {
      const th = findAll(tr, (el) => el.name === "th")[0];
      const td = findAll(tr, (el) => el.name === "td")[0];
      if (!th || !td) continue;
      const key = textOf(th).replace(/\s+/g, " ").trim();
      const tags = findAll(td, (el) => el.name === "span" && /\bselected-value\b/.test(el.attrs.class ?? "")).map((s) => cleanTag(textOf(s)));
      const raw = textOf(td).replace(/\s+/g, " ").trim();
      if (key === "") continue;
      if (/^(tags?|categories)$/i.test(key)) fields.push([key, tags.length > 0 ? tags : raw.split(",").map(cleanTag).filter(Boolean)]);
      else fields.push([key, notionDate(raw.replace(/^@/, "")) ?? raw]);
    }
  }
  // The body is the page without its header (the title and the property
  // table); Notion wraps it in <div class="page-body">.
  const bodyEl = findAll(root, (el) => /\bpage-body\b/.test(el.attrs.class ?? ""))[0];
  const dir = dirOf(path);
  const source = bodyEl ? `<div>${serialise(bodyEl)}</div>` : html;
  const md = htmlToMarkdown(source, { baseUrl: `${HTML_BASE}${dir === "" ? "" : `${dir.split("/").map(encodeURIComponent).join("/")}/`}` });
  // Back to rooted export paths, so the planner resolves them like the
  // Markdown export's relative ones.
  const body = md.replace(/\]\(https:\/\/notion-export\.invalid\/([^)\s]*)\)/g, (_w, p: string) => `](/${p})`);
  return { title, fields, body };
}

/** An element printed back as HTML, for handing a subtree to the converter. */
function serialise(el: ElementNode): string {
  const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return el.children
    .map((c) => {
      if (c.type === "text") return esc(c.text);
      const attrs = Object.entries(c.attrs)
        .map(([k, v]) => ` ${k}="${esc(v).replace(/"/g, "&quot;")}"`)
        .join("");
      return `<${c.name}${attrs}>${serialise(c)}</${c.name}>`;
    })
    .join("");
}

export function convertNotion(files: ExportFile[]): Converted {
  const out: Converted = { notes: [], attachments: [], skipped: [], stats: emptyStats() };
  // Databases first, so a row page can borrow its row's cells.
  const rowsByTitle = new Map<string, Array<[string, FrontValue]>>();
  const csvNotes: SourceNote[] = [];
  for (const f of files) {
    if (extensionOf(f.path) !== "csv" || isSystemFile(f.path)) continue;
    const raw = text(f.bytes);
    // Notion writes a `_all.csv` beside the view's own CSV in newer exports;
    // the fuller one wins, and the other is the same table again.
    if (/_all\.csv$/i.test(f.path) === false && files.some((g) => g.path === f.path.replace(/\.csv$/i, "_all.csv"))) {
      out.skipped.push({ path: f.path, reason: "unsupported" });
      continue;
    }
    const { rows } = parseDelimited(raw, ",");
    if (rows.length === 0) {
      out.skipped.push({ path: f.path, reason: "empty" });
      continue;
    }
    const [header, ...data] = rows;
    const title = stripNotionId(baseOf(f.path).replace(/(_all)?\.csv$/i, ""));
    const rowDir = `${dirOf(f.path) === "" ? "" : `${dirOf(f.path)}/`}${baseOf(f.path).replace(/(_all)?\.csv$/i, "")}`;
    const cell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
    const lines = [`| ${header.map(cell).join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`];
    for (const r of data) {
      const name = (r[0] ?? "").trim();
      const fields: Array<[string, FrontValue]> = [];
      header.forEach((h, i) => {
        if (i === 0 || (r[i] ?? "").trim() === "") return;
        const v = (r[i] ?? "").trim();
        fields.push([h.trim(), /^(tags?|categories)$/i.test(h.trim()) ? v.split(",").map(cleanTag).filter(Boolean) : (notionDate(v) ?? v)]);
      });
      if (name !== "") rowsByTitle.set(`${rowDir}\u0000${name}`, fields);
      // The row's own page, when Notion wrote one, is linked by its path.
      const page = files.find((g) => dirOf(g.path) === rowDir && /\.(md|html?)$/i.test(g.path) && stripNotionId(baseOf(g.path).replace(/\.(md|html?)$/i, "")) === name);
      const first = page ? `[${cell(name)}](${encodeURI(baseOf(page.path))})` : cell(name);
      lines.push(`| ${[first, ...header.slice(1).map((_h, i) => cell(r[i + 1] ?? ""))].join(" | ")} |`);
    }
    csvNotes.push({
      source: f.path,
      dir: dirOf(f.path),
      want: wantOf(f.path.replace(/_all\.csv$/i, ".csv"), title),
      title,
      // Relative to the folder of rows beside it, which is where the links go.
      body: lines.join("\n").replace(/\]\(([^)]+)\)/g, (_w, p: string) => `](${encodeURI(baseOf(rowDir))}/${p})`),
      fields: [],
    });
  }
  for (const f of files) {
    const ext = extensionOf(f.path);
    if (isSystemFile(f.path)) {
      out.skipped.push({ path: f.path, reason: "system" });
      continue;
    }
    if (ext === "csv") continue;
    if (ext === "md" || ext === "html" || ext === "htm") {
      const raw = text(f.bytes);
      if (raw.trim() === "") {
        out.skipped.push({ path: f.path, reason: "empty" });
        continue;
      }
      const page = ext === "md" ? notionProperties(raw) : htmlPage(raw, f.path);
      const title = page.title ?? stripNotionId(baseOf(f.path).replace(/\.(md|html?)$/i, ""));
      let fields = page.fields;
      if (fields.length === 0) fields = rowsByTitle.get(`${dirOf(f.path)}\u0000${title}`) ?? [];
      const norm = normaliseFields(fields);
      out.stats.properties += norm.length;
      out.stats.tags += norm.some(([k]) => k === "tags") ? 1 : 0;
      out.stats.created += norm.some(([k]) => k === "created") ? 1 : 0;
      out.notes.push({ source: f.path, dir: dirOf(f.path), want: wantOf(f.path, title), title, body: page.body, fields: norm });
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(ATTACHMENT_TYPES, ext)) {
      out.attachments.push({ source: f.path, name: cleanName(baseOf(f.path), "file"), bytes: f.bytes });
      continue;
    }
    out.skipped.push({ path: f.path, reason: "unsupported" });
  }
  out.notes.push(...csvNotes);
  return out;
}
