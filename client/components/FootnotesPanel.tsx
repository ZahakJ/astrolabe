// FOOTNOTES — the open note's `[^n]` notes, listed in the outline pane under
// the outline itself: the numeral, what the note says, and two doors.
//
// A long essay's footnotes are its second text, and until now the only way
// to read them together was to scroll to the foot and lose the page. Each
// row here is the definition as a line; clicking the row puts the reader ON
// THE REFERENCE (the caret lands on the `[^n]` in the editor, the reading
// view scrolls to the superscript), and the small arrow at the row's end
// lands on the DEFINITION instead — at the foot, or in the margin when the
// reading view has set the note as a sidenote (reading/sidenotes.ts). The
// surfaces answer by LABEL through client/footnoteNav.ts, so the row and the
// document cannot disagree about which note is meant.
//
// It reads the note the way the outline does (TocPanel.tsx): the open
// editor's buffer first, the disk otherwise, and not at all while a save is
// in flight. It is absent for a note with no footnotes, like the tracker and
// on-this-day sections one row down: a "Footnotes · 0" line on every note
// would be furniture.

import { useEffect, useState } from "react";
import { getNote } from "../api.ts";
import { footnotesOf, type Footnote } from "../../shared/footnotes.ts";
import { gotoFootnote } from "../footnoteNav.ts";
import { localeNum, t } from "../i18n.ts";
import { stripInline } from "../reading/toc.ts";
import { liveContent } from "../sectionActions.ts";
import { useStore } from "../state.ts";

const COLLAPSED_KEY = "astrolabe.footnotes-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export default function FootnotesPanel() {
  const openPath = useStore((s) => s.openPath);
  const isDirty = useStore((s) => (s.openPath ? !!s.dirty[s.openPath] : false));
  const reloadTick = useStore((s) => s.reloadTick);
  useStore((s) => s.language); // re-render the chrome strings on language change
  const [notes, setNotes] = useState<Footnote[]>([]);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    if (!openPath) {
      setNotes([]);
      return;
    }
    const live = liveContent(openPath);
    if (live !== null) {
      setNotes(footnotesOf(live));
      return;
    }
    if (isDirty) return; // recount once the autosave lands
    let cancelled = false;
    getNote(openPath)
      .then((note) => {
        if (!cancelled) setNotes(footnotesOf(note.content));
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [openPath, isDirty, reloadTick]);

  if (!openPath || notes.length === 0) return null;

  const toggle = (): void => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      // the preference lasts the session
    }
  };

  return (
    <section className="s-fnpanel">
      <header className="s-panel-header">
        <button type="button" className="s-mentions__toggle" onClick={toggle} aria-expanded={!collapsed} title={t(collapsed ? "showFootnotes" : "hideFootnotes")}>
          <span className={`s-tree__chevron${collapsed ? "" : " s-tree__chevron--open"}`} aria-hidden="true">
            ›
          </span>
          <span className="s-panel-title">{t("footnotes")}</span>
          <span className="s-panel-count">{localeNum(notes.length)}</span>
        </button>
      </header>
      {!collapsed && (
        <ol className="s-fnpanel__list" aria-label={t("footnotes")}>
          {notes.map((note) => {
            // `stripInline` is the outline's (it drops a mark only at a word's
            // edge, which is where a heading carries one); a note's italics
            // sit against punctuation — `*Muqaddima*,` — so the pairs come
            // off first.
            const text = note.text === "" ? t("footnoteUndefined") : stripInline(note.text.replace(/(\*\*|__|\*|_)(?=\S)([^*_]*?\S)\1/g, "$2"));
            const hasRef = note.refs.length > 0;
            return (
              <li key={note.label} className="s-fnpanel__row">
                <button
                  type="button"
                  className="s-fnpanel__ref"
                  // A definition nothing cites has no reference to land on:
                  // the row then opens the definition itself.
                  onClick={() => gotoFootnote({ path: openPath, label: note.label, end: hasRef ? "ref" : "def" })}
                  title={t(hasRef ? "footnoteGoRef" : "footnoteGoDef")}
                >
                  <span className="s-fnpanel__num" dir="auto">{note.label}</span>
                  <span className={`s-fnpanel__text${note.text === "" ? " s-fnpanel__text--missing" : ""}`} dir="auto">
                    {text}
                  </span>
                </button>
                {hasRef && note.defLine !== null && (
                  <button
                    type="button"
                    className="s-fnpanel__def s-iconbtn"
                    onClick={() => gotoFootnote({ path: openPath, label: note.label, end: "def" })}
                    title={t("footnoteGoDef")}
                    aria-label={t("footnoteGoDef")}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
