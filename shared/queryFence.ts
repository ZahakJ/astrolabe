// THE QUERY FENCE — a live list of notes inside a note.
//
// Obsidian readers reach for Dataview for one thing above all: "every note
// tagged X with status Y, as a table, sorted by date". The search box here
// already speaks the operators (shared/searchQuery.ts); a ```query fence
// carries the same operators plus how to draw the answer, and renders as a
// list, a table or a grid of cards — in the editor, the reading view and on
// the blog, scoped to the reader like every search. Obsidian renders the
// same fence language, so the note stays readable there.
//
//     ```query
//     tag:reading prop:status=reading -tag:draft
//     show: title, date, status, tags
//     sort: date desc
//     limit: 20
//     as: table
//     ```
//
// Every line that is not one of the four keys is part of the query. Pure,
// tested under node.

export type QueryView = "list" | "table" | "cards";
export type QuerySortKey = "date" | "modified" | "title" | "path" | "relevance";

export interface QuerySpec {
  /** The operator query, as the search box would take it. */
  q: string;
  /** Columns for a table; fields for a list/card. Empty → the defaults. */
  show: string[];
  sort: { key: QuerySortKey; dir: "asc" | "desc" };
  limit: number;
  as: QueryView;
}

export const QUERY_LIMIT_DEFAULT = 100;
export const QUERY_LIMIT_MAX = 500;

const SORT_KEYS: Record<string, QuerySortKey> = {
  date: "date", created: "date", "تاريخ": "date",
  modified: "modified", mtime: "modified", updated: "modified", "تعديل": "modified",
  title: "title", name: "title", "عنوان": "title",
  path: "path", file: "path", "مسار": "path",
  relevance: "relevance", score: "relevance",
};

const VIEWS: Record<string, QueryView> = {
  list: "list", "قائمة": "list",
  table: "table", "جدول": "table",
  cards: "cards", card: "cards", grid: "cards", "بطاقات": "cards",
};

function splitList(raw: string): string[] {
  return raw.split(/[,،]/).map((s) => s.trim()).filter((s) => s !== "");
}

export function parseQueryFence(body: string): QuerySpec {
  const words: string[] = [];
  const spec: QuerySpec = { q: "", show: [], sort: { key: "date", dir: "desc" }, limit: QUERY_LIMIT_DEFAULT, as: "list" };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("//") || line.startsWith("#")) continue;
    const m = /^([A-Za-z؀-ۿ]+)\s*:\s*(.*)$/.exec(line);
    const key = m?.[1].toLowerCase();
    const value = m?.[2].trim() ?? "";
    if (key === "show" || key === "columns" || key === "fields" || key === "أعمدة") {
      spec.show = splitList(value);
      continue;
    }
    if (key === "sort" || key === "order" || key === "ترتيب") {
      const parts = value.toLowerCase().split(/\s+/);
      const k = SORT_KEYS[parts[0] ?? ""];
      if (k) {
        spec.sort = { key: k, dir: parts[1] === "asc" || parts[1] === "تصاعدي" ? "asc" : parts[1] === "desc" || parts[1] === "تنازلي" ? "desc" : k === "title" || k === "path" ? "asc" : "desc" };
        continue;
      }
    }
    if (key === "limit" || key === "حد") {
      const n = Number(value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
      if (Number.isFinite(n) && n > 0) {
        spec.limit = Math.min(QUERY_LIMIT_MAX, Math.round(n));
        continue;
      }
    }
    if (key === "as" || key === "view" || key === "عرض") {
      const v = VIEWS[value.toLowerCase()];
      if (v) {
        spec.as = v;
        continue;
      }
    }
    // Anything else — `tag:x`, words, `prop:status=reading` — is the query.
    words.push(line);
  }
  spec.q = words.join(" ").trim();
  if (spec.show.length === 0) spec.show = spec.as === "table" ? ["title", "date", "tags"] : ["title", "excerpt"];
  return spec;
}

/** Which fence languages this module owns. */
export function queryFenceKind(line: string): "query" | null {
  const m = /^\s*(?:`{3,}|~{3,})\s*([^\s`~]*)\s*$/.exec(line);
  return m && m[1].toLowerCase() === "query" ? "query" : null;
}
