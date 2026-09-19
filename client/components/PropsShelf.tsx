// THE PROPERTIES SHELF — every frontmatter key the vault uses, under the tags.
//
// `prop:status=reading` has been an operator since the live queries came, and
// nobody types it, because nobody remembers what they called the key: was it
// `status`, `state`, `stage`? The shelf answers by listing what the index
// knows (GET /api/props): each key with the count of notes carrying it, and
// under a key, its distinct values with theirs. A click on a key runs
// `prop:key` in the search box above — the notes that HAVE it — and a click
// on a value runs `prop:key=value`. The tags shelf just above is the
// pattern: a collapsible section, a count in the header, the click a search.
//
// Rows rather than pills: a property is a name and a shape of values, which
// reads as a list with something to open, while a tag is a word.

import { useEffect, useState } from "react";
import { propQuery } from "../../shared/searchQuery.ts";
import type { PropCount } from "../../shared/types.ts";
import { getProps } from "../api.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import "../styles/props.css";

const COLLAPSED_KEY = "astrolabe.props-collapsed";
/** Keys shown before the shelf offers the rest, like the tag shelf's cap. */
const KEYS_CAP = 12;

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

interface Props {
  query: string;
  setQuery(q: string): void;
  /** Drawn inside the sidebar's shared shelf: no header, no fold of its own
   *  (the shelf's tab switch is the door), and the key count reported up so
   *  the tab can print it. */
  embedded?: boolean;
  onCount?: (n: number) => void;
}

export default function PropsShelf({ query, setQuery, embedded = false, onCount }: Props) {
  const tree = useStore((s) => s.tree);
  const [rows, setRows] = useState<PropCount[]>([]);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [all, setAll] = useState(false);

  // Track the tree, as the tags do: a save that adds a key is a tree event.
  useEffect(() => {
    getProps()
      .then((r) => {
        setRows(r);
        onCount?.(r.length);
      })
      .catch((err: unknown) => {
        console.error("astrolabe: loading properties failed", err);
      });
  }, [tree]);

  if (rows.length === 0) return null;

  const toggle = (): void => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      // storage unavailable — collapse still works for this session
    }
  };
  const toggleKey = (key: string): void =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const run = (q: string): void => setQuery(query.trim() === q ? "" : q);
  const shown = all ? rows : rows.slice(0, KEYS_CAP);

  const folded = embedded ? false : collapsed;
  return (
    <div className={`s-propshelf${folded ? " s-propshelf--collapsed" : ""}${embedded ? " s-propshelf--embedded" : ""}`}>
      {!embedded && (
        <button type="button" className="s-tags__toggle" onClick={toggle} aria-expanded={!collapsed} title={collapsed ? t("showProps") : t("hideProps")}>
          <span className={`s-tree__chevron${collapsed ? "" : " s-tree__chevron--open"}`} aria-hidden="true">
            ›
          </span>
          <span className="s-tags__title">{t("propsShelf")}</span>
          <span className="s-tags__total">{localeNum(rows.length)}</span>
        </button>
      )}
      {!folded && (
        <ul className="s-propshelf__list" aria-label={t("propsShelf")}>
          {shown.map((row) => {
            const isOpen = open.has(row.key);
            const keyQuery = propQuery(row.key);
            const active = query.trim() === keyQuery;
            return (
              <li key={row.key} className="s-propshelf__item">
                <div className="s-propshelf__row">
                  <button
                    type="button"
                    className={`s-propshelf__branch${isOpen ? " s-propshelf__branch--open" : ""}`}
                    aria-expanded={isOpen}
                    aria-label={tf(isOpen ? "propsCloseValues" : "propsOpenValues", { key: row.key })}
                    onClick={() => toggleKey(row.key)}
                  >
                    <span className="s-propshelf__chev" aria-hidden="true">›</span>
                  </button>
                  <button
                    type="button"
                    className={`s-propshelf__key${active ? " s-propshelf__key--active" : ""}`}
                    aria-pressed={active}
                    title={tf(active ? "propsClearFilter" : "propsSearchKey", { key: row.key })}
                    onClick={() => run(keyQuery)}
                  >
                    <bdi className="s-propshelf__name">{row.key}</bdi>
                    <span className="s-propshelf__count">{localeNum(row.count)}</span>
                  </button>
                </div>
                {isOpen && (
                  <ul className="s-propshelf__values">
                    {row.values.map((v) => {
                      const q = propQuery(row.key, v.value);
                      const on = query.trim() === q;
                      return (
                        <li key={v.value}>
                          <button
                            type="button"
                            className={`s-propshelf__value${on ? " s-propshelf__value--active" : ""}`}
                            aria-pressed={on}
                            title={q}
                            onClick={() => run(q)}
                          >
                            <bdi className="s-propshelf__name">{v.value}</bdi>
                            <span className="s-propshelf__count">{localeNum(v.count)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!folded && shown.length < rows.length && (
        <button type="button" className="s-tags__more s-propshelf__more" onClick={() => setAll(true)}>
          {tf("showMoreRows", { count: localeNum(rows.length - shown.length) })}
        </button>
      )}
    </div>
  );
}
