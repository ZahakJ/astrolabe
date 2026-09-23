// NEARBY — the outline pane's list of notes that read like the open one.
//
// The backlinks above it answer "who linked here", which is only ever the
// notes the author remembered to link. This list answers "what else did I
// write about this" from the words themselves: the ten notes whose uncommon
// vocabulary and tags overlap the open note's most, scored on the server by
// a TF-IDF cosine over the terms the index already holds (shared/nearby.ts,
// GET /api/nearby). No model, no network, nothing leaves the vault — which
// is why it can be on for every note without anyone being asked.
//
// Each row says which two terms tie the notes, because a related-notes list
// that cannot say WHY is a list the reader has to go and check. Admin only:
// the scoring reads every note's body, and a visitor's "related posts" would
// be an oracle for the unpublished ones. Re-read on every vault event, like
// the mentions list under it: an edit to any note moves every score a little.

import { useCallback, useEffect, useRef, useState } from "react";
import type { NearbyHit } from "../../shared/types.ts";
import { getNearby } from "../api.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import "../styles/nearby.css";
import { RelatedList, SuggestList } from "./MeaningPanels.tsx";

const COLLAPSED_KEY = "astrolabe.nearby-collapsed";
const VAULT_EVENT = "astrolabe:vault";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export default function NearbyPanel() {
  const openPath = useStore((s) => s.openPath);
  const admin = useStore((s) => s.admin);
  const openNote = useStore((s) => s.openNote);
  useStore((s) => s.language); // the chrome strings follow the language
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [rows, setRows] = useState<NearbyHit[]>([]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback((signal: AbortSignal): void => {
    if (!openPath || !admin) {
      setRows([]);
      return;
    }
    getNearby(openPath, signal)
      .then((hits) => {
        if (!signal.aborted) setRows(hits);
      })
      .catch(() => {
        if (!signal.aborted) setRows([]);
      });
  }, [openPath, admin]);

  useEffect(() => {
    let ctl = new AbortController();
    load(ctl.signal);
    let timer: ReturnType<typeof setTimeout> | null = null;
    // A sync storm is many events in a row; one read after the last of them.
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        ctl.abort();
        ctl = new AbortController();
        load(ctl.signal);
      }, 400);
    };
    window.addEventListener(VAULT_EVENT, onVault);
    return () => {
      window.removeEventListener(VAULT_EVENT, onVault);
      if (timer) clearTimeout(timer);
      ctl.abort();
    };
  }, [load]);

  // The hover previews the backlink cards get (client/landing.ts), on the
  // same `data-preview-path` contract, so a card here can be read before it
  // is opened.
  useEffect(() => {
    if (collapsed || rows.length === 0) return;
    let dispose: (() => void) | null = null;
    let dead = false;
    void import("../landing.ts").then((m) => {
      if (dead || !bodyRef.current) return;
      dispose = m.installNotePreviews(bodyRef.current, bodyRef.current);
    });
    return () => {
      dead = true;
      dispose?.();
    };
  }, [collapsed, rows.length]);

  if (!admin || !openPath) return null;

  const toggle = (): void => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      // storage unavailable
    }
  };

  return (
    <>
    <section className="s-nearby" title={t("nearbyHint")}>
      <header className="s-panel-header s-mentions__header">
        <button type="button" className="s-mentions__toggle" onClick={toggle} aria-expanded={!collapsed} title={t(collapsed ? "showNearby" : "hideNearby")}>
          <span className={`s-tree__chevron${collapsed ? "" : " s-tree__chevron--open"}`} aria-hidden="true">›</span>
          <span className="s-panel-title">{t("nearby")}</span>
          <span className="s-panel-count">{localeNum(rows.length)}</span>
        </button>
      </header>
      {!collapsed && (
        <div className="s-panel-body s-nearby__body" ref={bodyRef}>
          {rows.length === 0 ? (
            <p className="s-panel-empty">{t("nearbyNone")}</p>
          ) : (
            rows.map((hit) => (
              <div key={hit.path} className="s-backlink s-nearby__row" data-preview-path={hit.path}>
                <button type="button" className="s-backlink-open" onClick={() => openNote(hit.path)} title={hit.path}>
                  <span className="s-backlink-title">
                    <bdi>{hit.title}</bdi>
                    {/* The cosine as a percentage: a number a reader can
                        compare down the list, where 0.412 is not one. */}
                    <span className="s-nearby__score">{localeNum(Math.round(hit.score * 100))}%</span>
                  </span>
                </button>
                {hit.terms.length > 0 && (
                  <p className="s-nearby__terms" title={tf("nearbyTerms", { terms: hit.terms.join(", ") })}>
                    {hit.terms.map((term) => (
                      <bdi key={term} className="s-nearby__term">{term}</bdi>
                    ))}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </section>
    {/* The meaning lists (docs/ask.md), under their own headings: what the
        note is ABOUT, less what Nearby already named, then passages worth
        linking. Same chunk, so the pane pays one download for all three. */}
    <RelatedList lexical={rows} />
    <SuggestList />
    </>
  );
}
