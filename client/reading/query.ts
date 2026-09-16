// THE QUERY FENCE, DRAWN — a list, a table, a grid of cards or a timeline
// over the rows `GET /api/query` answers. Loaded on demand like the tracker board; inert
// like it (rows are wikilinks by class, so the reading root's ONE delegated
// click handler navigates). One renderer for the reading view, the blog, a
// transclusion and the editor's block widget.

import "./query.css";
import type { QueryHit } from "../../shared/types.ts";
import type { QuerySpec } from "../../shared/queryFence.ts";
import { queryNotes } from "../api.ts";
import { groupRuns, timelineOrder } from "../../shared/timeline.ts";
import { siteDate } from "../dates.ts";
import { autoDir, localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import { el } from "./dom.ts";

export interface QueryHooks {
  notePath: string;
  onResize?: () => void;
}

const BUILT_IN = new Set(["title", "date", "modified", "tags", "excerpt", "path"]);

function columnLabel(col: string): string {
  switch (col) {
    case "title": return t("queryColTitle");
    case "date": return t("queryColDate");
    case "modified": return t("queryColModified");
    case "tags": return t("queryColTags");
    case "excerpt": return t("queryColExcerpt");
    case "path": return t("queryColPath");
    default: return col;
  }
}

function cellOf(hit: QueryHit, col: string, locale: string): { text: string; link: boolean } {
  switch (col) {
    case "title": return { text: hit.title, link: true };
    // A note's own date is a calendar DAY stored at UTC midnight (the
    // indexer's parseFmDate), so it is printed in UTC or it slips a day west
    // of Greenwich — the Media page's dateText rule. The mtime is a moment.
    case "date": return { text: hit.dateMs > 0 ? siteDate(hit.dateMs, locale, { dateStyle: "medium", timeZone: "UTC" }) : "", link: false };
    case "modified": return { text: siteDate(hit.mtimeMs, locale, { dateStyle: "medium" }), link: false };
    case "tags": return { text: hit.tags.map((x) => `#${x}`).join(" "), link: false };
    case "excerpt": return { text: hit.excerpt, link: false };
    case "path": return { text: hit.path, link: false };
    default: return { text: hit.props[col.toLowerCase()] ?? "", link: false };
  }
}

function noteLink(hit: QueryHit, cls: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.className = `${cls} s-rv-wikilink`;
  a.dataset.target = hit.path;
  a.setAttribute("role", "link");
  a.tabIndex = 0;
  a.dir = autoDir(hit.title);
  a.textContent = hit.title;
  return a;
}

export function renderQueryFence(spec: QuerySpec, hooks: QueryHooks): HTMLElement {
  const box = el("div", `s-rv-query s-rv-query--${spec.as}`);
  const locale = useStore.getState().blogLocale;
  const head = el("div", "s-rv-query__head");
  head.appendChild(el("span", "s-rv-query__q", spec.q || t("queryAll")));
  const count = el("span", "s-rv-query__count", "…");
  head.appendChild(count);
  box.appendChild(head);
  const body = el("div", "s-rv-query__body");
  box.appendChild(body);

  queryNotes(spec.q, spec.sort.key, spec.sort.dir, spec.limit)
    .then((hits) => {
      count.textContent = tf("queryCount", { n: localeNum(hits.length) });
      if (hits.length === 0) {
        body.appendChild(el("p", "s-rv-query__empty", t("queryEmpty")));
        hooks.onResize?.();
        return;
      }
      if (spec.as === "timeline") {
        body.appendChild(timeline(spec, hits, locale));
        hooks.onResize?.();
        return;
      }
      if (spec.as === "table") {
        const wrap = el("div", "s-rv-query__tablewrap");
        const table = el("table", "s-rv-query__table");
        const thead = el("thead", "");
        const hr = el("tr", "");
        for (const col of spec.show) hr.appendChild(el("th", "", columnLabel(col)));
        thead.appendChild(hr);
        table.appendChild(thead);
        const tbody = el("tbody", "");
        for (const hit of hits) {
          const tr = el("tr", "");
          for (const col of spec.show) {
            const td = el("td", BUILT_IN.has(col) ? `s-rv-query__${col}` : "s-rv-query__prop");
            const cell = cellOf(hit, col, locale);
            if (cell.link) td.appendChild(noteLink(hit, "s-rv-query__link"));
            else {
              td.textContent = cell.text;
              td.dir = autoDir(cell.text);
            }
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        wrap.appendChild(table);
        body.appendChild(wrap);
      } else {
        const list = el(spec.as === "cards" ? "div" : "ul", spec.as === "cards" ? "s-rv-query__grid" : "s-rv-query__list");
        for (const hit of hits) {
          const item = el(spec.as === "cards" ? "div" : "li", spec.as === "cards" ? "s-rv-query__card" : "s-rv-query__row");
          item.dir = autoDir(hit.title);
          item.appendChild(noteLink(hit, "s-rv-query__title"));
          const meta: string[] = [];
          for (const col of spec.show) {
            if (col === "title") continue;
            const cell = cellOf(hit, col, locale);
            if (cell.text === "") continue;
            if (col === "excerpt") {
              const p = el("p", "s-rv-query__excerpt", cell.text);
              p.dir = autoDir(cell.text);
              item.appendChild(p);
            } else meta.push(BUILT_IN.has(col) ? cell.text : `${col}: ${cell.text}`);
          }
          if (meta.length > 0) {
            const m = el("span", "s-rv-query__meta", meta.join(" · "));
            m.dir = "auto";
            item.appendChild(m);
          }
          list.appendChild(item);
        }
        body.appendChild(list);
      }
      hooks.onResize?.();
    })
    .catch(() => {
      count.textContent = "";
      body.appendChild(el("p", "s-rv-query__empty", t("queryFailed")));
      hooks.onResize?.();
    });
  return box;
}

/** THE TIMELINE: rows on a vertical rule, a dot each, under year headings.
 *  The date is the fence's `by:` (shared/timeline.ts orders the rows and
 *  says which have one); the year and the day are printed by `siteDate`,
 *  so a site set to the Hijri calendar heads its years ١٤٤٧ and ١٤٤٨ and a
 *  Gregorian one 2025 and 2026, from the same rows. Rows the timeline cannot
 *  place gather at the end under their own quiet heading rather than
 *  vanish: a fence is a report, and a report that drops rows is wrong. */
function timeline(spec: QuerySpec, hits: QueryHit[], locale: string): HTMLElement {
  const wrap = el("div", "s-rv-timeline");
  const ordered = timelineOrder(hits, spec.by, spec.sort.dir);
  const yearOf = (ms: number | null): string | null => (ms === null ? null : siteDate(ms, locale, { year: "numeric", timeZone: "UTC" }));
  for (const group of groupRuns(ordered, (r) => yearOf(r.ms))) {
    const section = el("section", "s-rv-timeline__year");
    const head = el("h4", "s-rv-timeline__yearhead", group.key ?? t("timelineUndated"));
    head.dir = "auto";
    section.appendChild(head);
    const list = el("ol", "s-rv-timeline__list");
    for (const { row: hit, ms } of group.rows) {
      const item = el("li", "s-rv-timeline__row");
      item.dir = autoDir(hit.title);
      const when = el("span", "s-rv-timeline__when", ms === null ? "" : siteDate(ms, locale, { month: "short", day: "numeric", timeZone: "UTC" }));
      when.dir = "auto";
      item.appendChild(when);
      const bodyEl = el("div", "s-rv-timeline__body");
      bodyEl.appendChild(noteLink(hit, "s-rv-query__title"));
      const meta: string[] = [];
      for (const col of spec.show) {
        if (col === "title") continue;
        const cell = cellOf(hit, col, locale);
        if (cell.text === "") continue;
        if (col === "excerpt") {
          const p = el("p", "s-rv-query__excerpt", cell.text);
          p.dir = autoDir(cell.text);
          bodyEl.appendChild(p);
        } else meta.push(BUILT_IN.has(col) ? cell.text : `${col}: ${cell.text}`);
      }
      if (meta.length > 0) {
        const m = el("span", "s-rv-query__meta", meta.join(" · "));
        m.dir = "auto";
        bodyEl.appendChild(m);
      }
      item.appendChild(bodyEl);
      list.appendChild(item);
    }
    section.appendChild(list);
    wrap.appendChild(section);
  }
  return wrap;
}
