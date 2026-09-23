// MEANING SEARCH — the sidebar box's second mode (docs/ask.md).
//
// The same box, the same rows, a different question: not "which notes contain
// these words" but "which passages say something like this". Each hit is the
// best passage of one note — its title, the heading the passage sits under,
// the passage itself — and opens the note AT that heading, because a hit on
// the fourth section is a hit on the fourth section.
//
// The ranking is the embedding index's (GET /api/semantic), so a question in
// Arabic finds an English note that answers it and the other way round. When
// Ollama is not running the list is one line saying so; the exact search is a
// click away on the same switch, and never depended on any of this.

import { useEffect, useState, type KeyboardEvent, type MutableRefObject } from "react";
import type { SemanticHit } from "../../shared/types.ts";
import { ApiError } from "../api.ts";
import { askErrorLine, semanticSearch } from "../askApi.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import "../styles/semantic.css";

const DEBOUNCE_MS = 300;

interface Props {
  query: string;
  listRef: MutableRefObject<HTMLDivElement | null>;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}

export default function SemanticResults({ query, listRef, onKeyDown }: Props) {
  useStore((s) => s.language);
  const [hits, setHits] = useState<SemanticHit[] | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    const timer = window.setTimeout(() => {
      semanticSearch(query, ctl.signal)
        .then((r) => {
          setHits(r.hits);
          setPending(r.pending);
          setError(null);
        })
        .catch((err: unknown) => {
          if (ctl.signal.aborted) return;
          setHits([]);
          setError(askErrorLine(err instanceof ApiError ? err.code : undefined));
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctl.abort();
    };
  }, [query]);

  return (
    <div className="s-search__results s-semantic" role="region" aria-label={t("searchMeaningResultsAria")} ref={listRef} onKeyDown={onKeyDown}>
      <p className="s-sr-only" role="status">
        {hits === null ? "" : hits.length === 0 ? t("noResultsAria") : tf("resultCount", { count: localeNum(hits.length) })}
      </p>
      {error !== null && <p className="s-semantic__line">{error}</p>}
      {error === null && pending > 0 && <p className="s-semantic__line">{tf("searchMeaningPending", { n: localeNum(pending) })}</p>}
      {error === null && hits !== null && hits.length === 0 && <p className="s-search__none">{t("noMatchesDot")}</p>}
      {hits?.map((hit) => (
        <div key={hit.path} className="s-search-row" data-preview-path={hit.path}>
          <button
            type="button"
            className="s-search-hit"
            onClick={() => void import("../landing.ts").then((m) => m.landOnLine(hit.path, hit.line))}
          >
            <span className="s-search-hit__title s-semantic__title">
              <bdi>{hit.title}</bdi>
              {/* A number a reader can compare down the list. */}
              <span className="s-semantic__score">{localeNum(Math.round(hit.score * 100))}%</span>
            </span>
            {hit.heading && (
              <span className="s-semantic__heading">
                › <bdi>{hit.heading}</bdi>
              </span>
            )}
            <span className="s-search-hit__snippet s-semantic__text" dir="auto">
              {hit.text}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}
