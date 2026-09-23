// RELATED and SUGGEST LINKS — the Nearby section's two meaning lists
// (docs/ask.md). Rendered by NearbyPanel.tsx, inside its lazy chunk.
//
// RELATED is the open note's nearest notes by embedding (GET
// /api/semantic/related): not the words it shares — Nearby, above, already
// answers that — but what it is ABOUT, so a note in Arabic and its English
// counterpart find each other with no word in common. The lexical list stays
// as it was; this one sits under its own heading and leaves out every note
// Nearby already named.
//
// SUGGEST LINKS is passages elsewhere that read like this note and are not
// linked with it in either direction (GET /api/semantic/suggest), each with a
// Link button that puts `[[Note#Heading]]` at the caret — in the editor's own
// buffer, one undoable change, carried to disk by the autosave. Unlinked
// MENTIONS (the note's own name written in prose) are a different question
// with its own list below; the two are never merged.
//
// Ollama down, or the model not pulled: the Related list says so in one
// line, and Suggest is not drawn at all — one sentence about a missing
// service is enough.

import { useCallback, useEffect, useState } from "react";
import type { LinkSuggestion, NearbyHit, SemanticHit } from "../../shared/types.ts";
import { ApiError } from "../api.ts";
import { askErrorLine, relatedNotes, suggestLinks } from "../askApi.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";

const VAULT_EVENT = "astrolabe:vault";

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "true";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // storage unavailable
  }
}

/** Load `fetcher(openPath)` now and again after every burst of vault events. */
function useLive<T>(openPath: string | null, enabled: boolean, fetcher: (path: string, signal: AbortSignal) => Promise<T[]>) {
  const [rows, setRows] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    (signal: AbortSignal): void => {
      if (!openPath || !enabled) {
        setRows([]);
        return;
      }
      fetcher(openPath, signal)
        .then((r) => {
          if (signal.aborted) return;
          setRows(r);
          setError(null);
        })
        .catch((err: unknown) => {
          if (signal.aborted) return;
          setRows([]);
          setError(askErrorLine(err instanceof ApiError ? err.code : undefined));
        });
    },
    [openPath, enabled, fetcher],
  );
  useEffect(() => {
    let ctl = new AbortController();
    load(ctl.signal);
    let timer: ReturnType<typeof setTimeout> | null = null;
    // The index re-embeds a changed note a moment after the save, so the
    // re-read waits a little longer than Nearby's.
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        ctl.abort();
        ctl = new AbortController();
        load(ctl.signal);
      }, 2_500);
    };
    window.addEventListener(VAULT_EVENT, onVault);
    return () => {
      window.removeEventListener(VAULT_EVENT, onVault);
      if (timer) clearTimeout(timer);
      ctl.abort();
    };
  }, [load]);
  return { rows, setRows, error };
}

export function RelatedList({ lexical }: { lexical: readonly NearbyHit[] }) {
  const openPath = useStore((s) => s.openPath);
  const openNote = useStore((s) => s.openNote);
  const preview = useStore((s) => s.previewVisitor);
  const [collapsed, setCollapsed] = useState(() => readFlag("astrolabe.related-collapsed", false));
  const { rows, error } = useLive<SemanticHit>(openPath, !collapsed && !preview, relatedNotes);
  // Previewing as a visitor: a visitor has no meaning index to ask.
  if (preview) return null;
  const shown = rows.filter((r) => !lexical.some((l) => l.path === r.path));
  const toggle = (): void => {
    setCollapsed(!collapsed);
    writeFlag("astrolabe.related-collapsed", !collapsed);
  };
  return (
    <section className="s-related" title={t("relatedHint")}>
      <header className="s-panel-header s-mentions__header">
        <button type="button" className="s-mentions__toggle" onClick={toggle} aria-expanded={!collapsed} title={t(collapsed ? "showRelated" : "hideRelated")}>
          <span className={`s-tree__chevron${collapsed ? "" : " s-tree__chevron--open"}`} aria-hidden="true">›</span>
          <span className="s-panel-title">{t("related")}</span>
          {!collapsed && error === null && <span className="s-panel-count">{localeNum(shown.length)}</span>}
        </button>
      </header>
      {!collapsed && (
        <div className="s-panel-body s-nearby__body">
          {error !== null ? (
            <p className="s-panel-empty">{error}</p>
          ) : shown.length === 0 ? (
            <p className="s-panel-empty">{t(rows.length > 0 ? "relatedAllNearby" : "relatedNone")}</p>
          ) : (
            shown.map((hit) => (
              <div key={hit.path} className="s-backlink s-nearby__row" data-preview-path={hit.path}>
                <button type="button" className="s-backlink-open" onClick={() => openNote(hit.path)} title={hit.path}>
                  <span className="s-backlink-title">
                    <bdi>{hit.title}</bdi>
                    <span className="s-nearby__score">{localeNum(Math.round(hit.score * 100))}%</span>
                  </span>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

/** Put `link` at the caret of the open note — through its editor buffer when
 *  it has one (one undoable change, the autosave writes it), else at the end
 *  of the note through the same door the outline's section moves use. */
async function insertLink(path: string, link: string): Promise<void> {
  const { bufferOf, applyToBuffer } = await import("../editor/buffers.ts");
  const buf = bufferOf(path);
  if (buf) {
    const at = buf.state.selection.main.head;
    // A link is a word: it gets a space on each side it touches another.
    const before = at > 0 ? buf.state.sliceDoc(at - 1, at) : "";
    const after = buf.state.sliceDoc(at, at + 1);
    const lead = before !== "" && !/\s/.test(before) ? " " : "";
    const trail = after !== "" && !/\s/.test(after) ? " " : "";
    const text = `${lead}${link}${trail}`;
    applyToBuffer(path, { changes: { from: at, insert: text }, selection: { anchor: at + text.length } });
    return;
  }
  const { applyNoteContent, noteContent } = await import("../sectionActions.ts");
  const content = await noteContent(path);
  const sep = content === "" || content.endsWith("\n\n") ? "" : content.endsWith("\n") ? "\n" : "\n\n";
  await applyNoteContent(path, `${content}${sep}${link}\n`);
}

export function SuggestList() {
  const openPath = useStore((s) => s.openPath);
  const preview = useStore((s) => s.previewVisitor);
  const [collapsed, setCollapsed] = useState(() => readFlag("astrolabe.suggest-collapsed", false));
  const { rows, setRows, error } = useLive<LinkSuggestion>(openPath, !collapsed && !preview, suggestLinks);
  if (!openPath || error !== null || preview) return null;
  const toggle = (): void => {
    setCollapsed(!collapsed);
    writeFlag("astrolabe.suggest-collapsed", !collapsed);
  };
  const link = async (row: LinkSuggestion): Promise<void> => {
    try {
      await insertLink(openPath, row.link);
      setRows((list) => list.filter((r) => r !== row));
      toast(tf("suggestLinked", { link: row.link }));
    } catch (err) {
      console.error("astrolabe: inserting the link failed", err);
      toast(t("suggestLinkFailed"), "error");
    }
  };
  return (
    <section className="s-suggest" title={t("suggestHint")}>
      <header className="s-panel-header s-mentions__header">
        <button type="button" className="s-mentions__toggle" onClick={toggle} aria-expanded={!collapsed} title={t(collapsed ? "showSuggest" : "hideSuggest")}>
          <span className={`s-tree__chevron${collapsed ? "" : " s-tree__chevron--open"}`} aria-hidden="true">›</span>
          <span className="s-panel-title">{t("suggestLinks")}</span>
          {!collapsed && <span className="s-panel-count">{localeNum(rows.length)}</span>}
        </button>
      </header>
      {!collapsed && (
        <div className="s-panel-body s-mentions__body">
          {rows.length === 0 ? (
            <p className="s-panel-empty">{t("suggestNone")}</p>
          ) : (
            rows.map((row) => (
              <div key={row.path} className="s-backlink s-mentions__row" data-preview-path={row.path}>
                <button
                  type="button"
                  className="s-backlink-open"
                  onClick={() => void import("../landing.ts").then((m) => m.landOnLine(row.path, row.line))}
                  title={row.path}
                >
                  <span className="s-backlink-title">
                    <bdi>{row.title}</bdi>
                    {row.heading && (
                      <span className="s-suggest__heading">
                        {" › "}
                        <bdi>{row.heading}</bdi>
                      </span>
                    )}
                  </span>
                </button>
                <div className="s-mentions__line">
                  <p className="s-backlink-context s-mentions__context s-suggest__text" dir="auto">
                    {row.text}
                  </p>
                  <button type="button" className="s-mentions__link" onClick={() => void link(row)} title={tf("suggestLinkTitle", { link: row.link })}>
                    {t("mentionLink")}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
