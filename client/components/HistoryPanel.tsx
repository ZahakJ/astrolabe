// Note history — the undo of last resort, in the right panel.
//
// Backup & sync has been committing the whole vault since v1.6 and there was
// no way in the product to LOOK at what it kept. That is the locked-fire-exit
// shape the trash browser was built to fix one floor down: a safety net
// nobody can reach is a safety net in the same sense that a locked fire exit
// is a fire exit. This is `git log --follow` over the open note, a read-only
// render of any revision, and one button that puts it back.
//
// It ships FIRST in this release and the scary tools stand on it. Vault-wide
// search & replace and tag rename are what a note-taker most wants and least
// trusts, and the reason is that a bad vault-wide edit is unrecoverable.
//
// THE TIMELINE HAS TWO SOURCES. The vault's own write path keeps
// the previous content of every note it overwrites (server/versions.ts) —
// with or without git — and those versions are rows here beside the commits,
// in ONE list ordered by time rather than in two sections. The question a
// reader brings to this panel is "the text before I broke it", which is a
// question about a MOMENT; two lists over the same note would hand them two
// clocks to reconcile, and on the commonest instance (no repository yet) the
// second list would be an empty section under a door. A version row reads
// quieter than a commit row — muted, in the UI face — because a commit is
// something somebody named and a version is something the app kept.
//
// THREE DECISIONS WORTH THE INK:
//
// 1. THE SECTION STARTS COLLAPSED AND ASKS GIT NOTHING UNTIL IT IS OPENED.
//    `git log --follow` is a PROCESS, and the panel would otherwise spawn one
//    on every note the reader opens, for ever, to fill a list most sessions
//    never look at. The header is always there — it is a door, not a hover
//    reveal — and the choice persists, so the reader who wants history pays
//    for it and nobody else does. Same storage idiom as the local graph.
//
// 2. RESTORING A COMMIT IS AN ORDINARY EDIT. It goes through
//    `applyNoteContent`, the same seam the outline's section moves use: one
//    transaction into the open editor when one holds the note (so Ctrl+Z
//    takes it back and the existing autosave carries it to disk under its
//    precondition), and `putNote` otherwise. Nothing here writes a special
//    path, and a restore is itself a revision — which is exactly why the
//    toast's Undo is a second restore, of the text that was on screen a
//    moment ago, rather than a rollback verb this feature would have had to
//    invent.
//
//    RESTORING A VERSION GOES THROUGH THE SERVER, and the difference is
//    deliberate: `POST /api/versions/restore` writes through the vault's own
//    write path, so the text being replaced is kept as a version too — tagged
//    "restore" and exempt from the five-minute collapse, because it is the
//    text the reader is most likely to want back next. An autosave carrying
//    the same text would have been collapsed into the burst it landed in.
//    The open editor then ADOPTS the result exactly as it adopts any external
//    write (an undoable transaction), and the Undo toast is the same second
//    restore as above. It asks first, because it is one press with no dirty
//    state in between: the commit restore lands in the editor unsaved, this
//    one lands on disk.
//
// 3. NO DIFF VIEW, AND THE MARKERS INSTEAD. The spec offered a diff if it were
//    cheap. A real line-level diff is a renderer, a stylesheet and a second
//    modal state; what a timeline is actually asked is "how much of this was
//    that edit", and `+12 −3` answers it from numbers `git log --numstat`
//    already put in the same response. A version row answers the same
//    question with its size. The whole text is one tap away for the reader
//    who needs more than a number.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { noteLabelOf } from "../../shared/noteFormat.ts";
import type {
  NoteHistoryResponse,
  NoteRevision,
  NoteVersion,
  NoteVersionsResponse,
} from "../../shared/types.ts";
import { getNoteHistory, getNoteRevision, getNoteVersion, getNoteVersions, restoreNoteVersion } from "../api.ts";
import { relativeDate, siteDate } from "../dates.ts";
import { adoptExternalChange, flushBufferPath } from "../editor/bufferBridge.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { applyNoteContent, noteContent } from "../sectionActions.ts";
import { HISTORY_CHANGED_EVENT, historyChanged } from "../sync.ts";
import { markSelfWrite, useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { actionToast } from "../undoToast.ts";
import { renderNoteContent } from "../reading/renderNote.ts";
import { applyNoteLayoutTo } from "../textLayout.ts";
import { confirmModal, isConfirmOpen } from "./Confirm.tsx";
import "../styles/history.css";

const COLLAPSED_KEY = "astrolabe.history-collapsed";

/** "Open the history section." Rung by any surface that wants to SHOW this
 *  list rather than merely reveal the pane around it — the tour's history
 *  folio is the first. Declared here because the listener is here; callers
 *  outside this chunk dispatch the literal rather than import it, so pressing
 *  a button never fetches the revision reader. */
export const HISTORY_REVEAL_EVENT = "astrolabe:history-reveal";

/** Collapsed BY DEFAULT — see decision 1 above. An unreadable stored value is
 *  the default, not a crash: private windows throw on the accessor. */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) !== "false";
  } catch {
    return true;
  }
}

/** One row of the timeline: a commit, or a version the write path kept.
 *  `when` is the moment the row is SORTED and PRINTED by — a commit's author
 *  date, a version's own mtime (when that text was last saved), which is the
 *  moment a reader means by "the version from Tuesday". */
type Entry =
  | { kind: "git"; key: string; when: number; rev: NoteRevision }
  | { kind: "version"; key: string; when: number; ver: NoteVersion };

/** Either source can fail on its own; the other still draws. Both null is
 *  the one state that reads as an error. */
type Feed =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; git: NoteHistoryResponse | null; versions: NoteVersionsResponse | null };

function merge(git: NoteHistoryResponse | null, versions: NoteVersionsResponse | null): Entry[] {
  const out: Entry[] = [];
  for (const rev of git?.revisions ?? []) {
    out.push({ kind: "git", key: `g:${rev.sha}`, when: Date.parse(rev.iso), rev });
  }
  for (const ver of versions?.versions ?? []) {
    out.push({ kind: "version", key: `v:${ver.at}`, when: ver.mtimeMs, ver });
  }
  out.sort((a, b) => b.when - a.when);
  return out;
}

/** When a revision was made. Recent enough and it is a DISTANCE ("3 days
 *  ago") — which is how a reader looking for "the version before I broke it"
 *  thinks; older and it is a date in the instance's own calendar. Both come
 *  out of client/dates.ts, so a Hijri instance dates its history in Hijri. */
function when(value: string | number, locale: string): string {
  return relativeDate(value, locale, { month: "short", day: "numeric", year: "numeric" });
}

/** The full moment, for the row's title and the revision modal's header. */
function fullWhen(value: string | number, locale: string): string {
  return siteDate(value, locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Astrolabe's own commit subjects, told in the reader's language. `commit()`
 *  writes `astrolabe snapshot:` / `astrolabe sync:` and an ISO instant — the subject
 *  for a terminal `git log`, and the wrong one in a timeline whose first
 *  column is already the moment: the row would say when twice, once in words
 *  and once as a machine timestamp. Anyone else's subject is left as written. */
const MACHINE_SUBJECT = /^astrolabe (snapshot|sync): /;

function subjectOf(rev: NoteRevision): string {
  const m = MACHINE_SUBJECT.exec(rev.subject);
  if (m !== null) return t(m[1] === "snapshot" ? "revisionSnapshot" : "revisionBackup");
  return rev.subject || rev.short;
}

/** A version's subject is WHY it exists (see VersionReason). */
function reasonOf(ver: NoteVersion): string {
  if (ver.reason === "restore") return t("versionRestore");
  if (ver.reason === "rename") return t("versionRename");
  return t("versionAutosave");
}

/** "3 KB", never "0 KB": a version that exists holds something. */
function kbOf(ver: NoteVersion): string {
  return tf("versionKb", { n: localeNum(Math.max(1, Math.round(ver.size / 1024))) });
}

function titleOf(entry: Entry): string {
  return entry.kind === "git" ? subjectOf(entry.rev) : reasonOf(entry.ver);
}

/** One text run, not three spans: a run of facts joined for the bidi
 *  algorithm reorders against itself when they are separate elements inside
 *  an RTL block. */
function metaOf(entry: Entry, locale: string): string {
  return entry.kind === "git"
    ? `${fullWhen(entry.rev.iso, locale)} — ${entry.rev.short}`
    : `${fullWhen(entry.ver.mtimeMs, locale)} — ${kbOf(entry.ver)}`;
}

function IconClock() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

// ── The revision viewer ─────────────────────────────────────────────────────

/** One revision or version, rendered read-only, with the way back on the
 *  footer.
 *
 *  `renderNoteContent` and not a second renderer: a `.tex` revision has to
 *  read as a `.tex` note, and that entry point is what makes that true by
 *  construction everywhere else in the product. `applyNoteLayoutTo` after it,
 *  so a revision of an Arabic note is read right-to-left here exactly as it is
 *  in the reading view. A version is drawn by the same code, from the same
 *  kind of string — the two sources differ in where the bytes come from and
 *  in nothing the reader sees. */
function RevisionModal({
  path,
  entry,
  onClose,
}: {
  path: string;
  entry: Entry;
  onClose: () => void;
}) {
  const locale = useStore((s) => s.blogLocale);
  const [body, setBody] = useState<{ state: "loading" | "error" } | { state: "ready"; content: string }>({
    state: "loading",
  });
  const [restoring, setRestoring] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  // The path THIS text lives under: a commit's row carries the path at that
  // revision (a renamed note's old name); a version is keyed by the note's
  // path today.
  const sourcePath = entry.kind === "git" ? entry.rev.path : path;

  useEffect(() => {
    let dead = false;
    setBody({ state: "loading" });
    const read =
      entry.kind === "git"
        ? getNoteRevision(entry.rev.path, entry.rev.sha)
        : getNoteVersion(path, entry.ver.at);
    read
      .then((blob) => {
        if (!dead) setBody({ state: "ready", content: blob.content });
      })
      .catch((err: unknown) => {
        console.error("astrolabe: reading a revision failed", err);
        if (!dead) setBody({ state: "error" });
      });
    return () => {
      dead = true;
    };
  }, [entry, path]);

  // Render into a detached tree and swap it in, the way every reading surface
  // in this product does — the renderer answers with an element, not a string,
  // because a string would mean `innerHTML` over note text.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || body.state !== "ready") return;
    const el = renderNoteContent(body.content, {
      notePath: sourcePath,
      tree: useStore.getState().tree,
    });
    el.classList.add("s-revision__content");
    applyNoteLayoutTo(el, body.content);
    host.replaceChildren(el);
  }, [body, sourcePath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The confirm dialog stacked on top owns Esc while it is open; closing
      // the viewer underneath it would leave the reader answering a question
      // about a text they can no longer see.
      if (e.key === "Escape" && !isConfirmOpen()) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** The Undo every restore offers: a second restore, of the text that was on
   *  screen a moment ago — read buffer-first BEFORE the write, because the
   *  file on disk can be 600ms behind the keyboard. */
  const offerUndo = (message: string, before: string) => {
    actionToast(message, t("undo"), () => {
      void applyNoteContent(path, before)
        .then(() => toast(t("revisionRestoreUndone")))
        .catch((err: unknown) => {
          console.error("astrolabe: undoing a restore failed", err);
          toast(t("revisionRestoreFailed"), "error");
        });
    });
  };

  // The tree's own label, like the delete toast and the tab bar
  // (state.ts::deleteNote) — a toast reading “Target.md” beside a row
  // reading "Target" is one file wearing two names.
  const name = noteLabelOf(path);

  const restoreRevision = async (rev: NoteRevision, content: string) => {
    const before = await noteContent(path);
    await applyNoteContent(path, content);
    onClose();
    offerUndo(tf("revisionRestored", { name, when: fullWhen(rev.iso, locale) }), before);
  };

  const restoreVersion = async (ver: NoteVersion) => {
    const moment = fullWhen(ver.mtimeMs, locale);
    const ok = await confirmModal({
      title: t("restoreVersionTitle"),
      body: tf("restoreVersionBody", { name, when: moment }),
      confirmLabel: t("restoreVersionConfirm"),
    });
    if (!ok) return;
    const before = await noteContent(path);
    // Unsaved edits land on disk FIRST, so the version the server keeps of
    // "what it says now" is what the reader sees and not a stale copy.
    await flushBufferPath(path);
    // Claimed as our own write: the SSE echo is then not adopted a second
    // time by the shell (it would be inside the flush's self-save window
    // anyway, and skipped for the wrong reason); the adoption below is the
    // one that runs, and it runs whether or not the stream is quick.
    markSelfWrite(path);
    await restoreNoteVersion(path, ver.at);
    onClose();
    // The restore is itself a version now; the list must show it.
    historyChanged();
    const adopted = await adoptExternalChange(path);
    if (!adopted) useStore.getState().bumpReload();
    offerUndo(tf("versionRestored", { name, when: moment }), before);
  };

  const restore = () => {
    if (body.state !== "ready" || restoring) return;
    setRestoring(true);
    const content = body.content;
    void (async () => {
      try {
        if (entry.kind === "git") await restoreRevision(entry.rev, content);
        else await restoreVersion(entry.ver);
      } catch (err) {
        console.error("astrolabe: restoring a revision failed", err);
        toast(t("revisionRestoreFailed"), "error");
      } finally {
        setRestoring(false);
      }
    })();
  };

  return createPortal(
    <div className="s-revision-overlay" onMouseDown={onClose}>
      <div
        className="s-revision"
        role="dialog"
        aria-modal="true"
        aria-label={t("revisionTitle")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="s-revision__header">
          <span className="s-revision__glyph" aria-hidden="true">
            <IconClock />
          </span>
          <span className="s-revision__heading">
            <span className="s-revision__title" dir="auto">
              {titleOf(entry)}
            </span>
            <span className="s-revision__meta" dir="auto">
              {metaOf(entry, locale)}
            </span>
          </span>
          <button
            type="button"
            className="s-revision__close s-iconbtn"
            title={t("close")}
            aria-label={t("closeRevision")}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="s-revision__body">
          {body.state === "loading" && <p className="s-revision__note">{t("revisionLoading")}</p>}
          {body.state === "error" && <p className="s-revision__note">{t("revisionOpenFailed")}</p>}
          {body.state === "ready" && body.content.trim() === "" && (
            <p className="s-revision__note">{t("revisionEmpty")}</p>
          )}
          <div ref={hostRef} className="s-revision__render" />
        </div>
        <footer className="s-revision__footer">
          <button
            type="button"
            className="s-revision__restore"
            onClick={restore}
            disabled={body.state !== "ready" || restoring}
          >
            {t("restoreRevision")}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ── The timeline ────────────────────────────────────────────────────────────

export default function HistoryPanel() {
  const openPath = useStore((s) => s.openPath);
  const admin = useStore((s) => s.admin);
  const preview = useStore((s) => s.previewVisitor);
  const locale = useStore((s) => s.blogLocale);
  useStore((s) => s.language); // re-render the chrome strings on a language change
  const openSettingsAt = useStore((s) => s.openSettingsAt);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [feed, setFeed] = useState<Feed>({ state: "idle" });
  const [viewing, setViewing] = useState<Entry | null>(null);

  const active = !collapsed && !!openPath && admin && !preview;

  const load = useCallback(() => {
    if (!active || !openPath) return () => {};
    let dead = false;
    setFeed({ state: "loading" });
    // Both sources at once, and each on its own footing: a vault whose git is
    // broken still has its versions, and a store that cannot be read still
    // has its commits.
    void Promise.allSettled([getNoteHistory(openPath), getNoteVersions(openPath)]).then(
      ([git, versions]) => {
        if (dead) return;
        if (git.status === "rejected") console.error("astrolabe: reading note history failed", git.reason);
        if (versions.status === "rejected") console.error("astrolabe: reading note versions failed", versions.reason);
        setFeed({
          state: "ready",
          git: git.status === "fulfilled" ? git.value : null,
          versions: versions.status === "fulfilled" ? versions.value : null,
        });
      },
    );
    return () => {
      dead = true;
    };
  }, [active, openPath]);

  useEffect(load, [load]);

  // A snapshot taken from the palette while this list is open MUST show up in
  // it — the reader just made that row on purpose. So must a restore.
  useEffect(() => {
    if (!active) return;
    // `load()` hands back its own abandon-this-request function, and it is
    // kept rather than dropped: a refetch still in flight when the reader
    // switches notes must not land its answer in the new note's timeline.
    let abandon: (() => void) | null = null;
    const onChanged = () => {
      abandon?.();
      abandon = load();
    };
    window.addEventListener(HISTORY_CHANGED_EVENT, onChanged);
    return () => {
      abandon?.();
      window.removeEventListener(HISTORY_CHANGED_EVENT, onChanged);
    };
  }, [active, load]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      // storage unavailable — the collapse still works for this session
    }
  };

  // "Show me the history" from somewhere that is not this header. The section
  // is collapsed by default and its collapse is component-local (decision 1
  // above), so there is no store flag another surface could set — and a
  // caller that wrote `COLLAPSED_KEY` itself would be a second copy of this
  // component's state living in another file. A bus instead: the tour's
  // history folio rings it, and anything else that grows a door can too.
  useEffect(() => {
    const onReveal = () => {
      setCollapsed(false);
      try {
        localStorage.setItem(COLLAPSED_KEY, "false");
      } catch {
        // storage unavailable — it still opens for this session
      }
    };
    window.addEventListener(HISTORY_REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(HISTORY_REVEAL_EVENT, onReveal);
  }, []);

  // A visitor has no history at all (every route 401s or 404s to one), and an
  // admin PREVIEWING as a visitor must see exactly what a stranger would.
  if (!openPath || !admin || preview) return null;

  const ready = feed.state === "ready" ? feed : null;
  const entries = ready ? merge(ready.git, ready.versions) : [];
  const failed = ready !== null && ready.git === null && ready.versions === null;
  const noRepo = ready?.git !== null && ready?.git !== undefined && !ready.git.repo;
  const versionsOff = ready?.versions?.enabled === false;

  return (
    <section className="s-history">
      <header className="s-panel-header s-history__header">
        <button
          type="button"
          className="s-history__toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          title={t(collapsed ? "showHistory" : "hideHistory")}
        >
          <span
            className={`s-tree__chevron${collapsed ? "" : " s-tree__chevron--open"}`}
            aria-hidden="true"
          >
            ›
          </span>
          <span className="s-panel-title">{t("history")}</span>
          {entries.length > 0 && (
            <span className="s-panel-count">
              {localeNum(entries.length)}
              {ready?.git?.truncated ? "+" : ""}
            </span>
          )}
        </button>
      </header>
      {!collapsed && (
        <div className="s-history__body">
          {feed.state === "loading" && <p className="s-history__note">{t("historyLoading")}</p>}
          {failed && <p className="s-history__note">{t("historyFailed")}</p>}
          {entries.length > 0 && (
            <ol className="s-history__list" aria-label={t("historyAria")}>
              {entries.map((entry) => (
                <li key={entry.key}>
                  <button
                    type="button"
                    className={`s-histrow${entry.kind === "version" ? " s-histrow--version" : ""}`}
                    onClick={() => setViewing(entry)}
                    title={metaOf(entry, locale)}
                    aria-label={t(entry.kind === "git" ? "revisionAria" : "noteVersionAria")}
                  >
                    <span className="s-histrow__when" dir="auto">
                      {when(entry.when, locale)}
                    </span>
                    <span className="s-histrow__subject" dir="auto">
                      {titleOf(entry)}
                    </span>
                    {entry.kind === "git" && entry.rev.added !== null && entry.rev.removed !== null && (
                      <span
                        className="s-histrow__stat"
                        title={tf("revisionChanges", {
                          added: localeNum(entry.rev.added),
                          removed: localeNum(entry.rev.removed),
                        })}
                      >
                        <span className="s-histrow__plus">{`+${localeNum(entry.rev.added)}`}</span>
                        <span className="s-histrow__minus">{`−${localeNum(entry.rev.removed)}`}</span>
                      </span>
                    )}
                    {entry.kind === "version" && (
                      <span className="s-histrow__stat s-histrow__size">{kbOf(entry.ver)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          )}
          {/* The empty states and the footnotes get DOORS. "Backup is off"
              with nothing to press is the sentence this panel exists to stop
              printing. With rows above them these read as footnotes: the
              versions are here, and here is what would make them travel. */}
          {ready !== null && !failed && entries.length === 0 && ready.versions?.enabled && (
            <p className="s-history__note">{t("versionsEmpty")}</p>
          )}
          {versionsOff && (
            <div className="s-history__empty">
              <p className="s-history__note">{t("versionsOff")}</p>
              <button
                type="button"
                className="s-history__door"
                onClick={() => openSettingsAt("rowNoteVersions")}
              >
                {t("versionsOpenSettings")}
              </button>
            </div>
          )}
          {noRepo && (
            <div className="s-history__empty">
              <p className="s-history__note">
                {t(entries.length > 0 ? "historyNoRepoBeside" : "historyNoRepo")}
              </p>
              <button
                type="button"
                className="s-history__door"
                onClick={() => openSettingsAt("rowSyncEnabled")}
              >
                {t("historyOpenBackup")}
              </button>
            </div>
          )}
          {ready?.git?.repo && ready.git.revisions.length === 0 && (
            <div className="s-history__empty">
              <p className="s-history__note">{t("historyEmpty")}</p>
              <button
                type="button"
                className="s-history__door"
                onClick={() => void import("../sync.ts").then((m) => m.runSnapshotNow())}
              >
                {t("snapshotNow")}
              </button>
            </div>
          )}
          {ready?.git?.truncated && (
            <p className="s-history__note s-history__note--foot">{t("historyOlder")}</p>
          )}
        </div>
      )}
      {viewing !== null && (
        <RevisionModal path={openPath} entry={viewing} onClose={() => setViewing(null)} />
      )}
    </section>
  );
}
