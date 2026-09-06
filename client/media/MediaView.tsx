// THE MEDIA PAGE. Every ```tracker in the vault, shelved by kind.
//
// A workspace VIEW, like the graph (`view === "media"` in the store): it
// replaces the note column rather than opening in a pane, and it is a lazy
// chunk with its own stylesheet, because a reader who never presses the
// button owes none of it. It reads the same `GET /api/trackers` the board
// fence reads — the page is a second drawing of the shelf, not a second
// shelf — and it WRITES through two doors: a new work becomes a note of its
// own under `Media/<Kind>/` whose body is one tracker fence (shared/media.ts
// composes it), and an edit or a nudge goes to `POST /api/tracker`, which
// rewrites that fence in place and nothing around it.
//
// The layout rule the owner set: the kinds stack VERTICALLY with a hairline
// between them, the page scrolls, and a shelf is a grid of at most five
// works across. It never scrolls sideways. The column count is a container
// query on the page itself, so a shelf beside an open sidebar and one in a
// full window both obey the cap.

import { useCallback, useEffect, useMemo, useState } from "react";
import { foldKind, type TrackerKind, type TrackerStatus } from "../../shared/tracker.ts";
import type { TrackerMeta } from "../../shared/types.ts";
import { getTrackers, updateTracker } from "../api.ts";
import FolderGlyph from "../components/FolderGlyph.tsx";
import { relativeDate, siteDate } from "../dates.ts";
import { autoDir, countPhrase, localeNum, t, tf, type I18nKey } from "../i18n.ts";
import { KIND_UNIT, unitKey } from "../trackerUnits.ts";
import { TREE_REVEAL_EVENT } from "../components/Sidebar.tsx";
import { sidebarIsDrawer } from "../state.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { fileUrl } from "../editor/embeds.ts";
import { MediaForm } from "./MediaForm.tsx";
import { STATUS_FILTERS, shelve, type Shelf } from "./mediaModel.ts";
import "../styles/media.css";

/** The event App.tsx raises for every vault change; the page re-reads the
 *  shelf on it, because a fence edited by hand in another window is still
 *  this page's business. */
export const VAULT_EVENT = "astrolabe:vault";

const SHELF_LABEL: Record<Shelf, I18nKey> = {
  show: "mediaSectionShow",
  game: "mediaSectionGame",
  book: "mediaSectionBook",
  film: "mediaSectionFilm",
  course: "mediaSectionCourse",
  project: "mediaSectionProject",
  habit: "mediaSectionHabit",
  other: "mediaSectionOther",
};

const SHELF_ICON: Record<Shelf, string> = {
  show: "film",
  game: "gamepad",
  book: "book",
  film: "film",
  course: "scroll",
  project: "flask",
  habit: "leaf",
  other: "sparkle",
};

const STATUS_LABEL: Record<TrackerStatus, I18nKey> = {
  planned: "trackerStatusPlanned",
  active: "trackerStatusActive",
  done: "trackerStatusDone",
  paused: "trackerStatusPaused",
  dropped: "trackerStatusDropped",
};

/** An ISO date under the instance's calendar; anything else as written. */
function dateText(raw: string, locale: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw;
  return siteDate(raw, locale, { dateStyle: "medium", timeZone: "UTC" }) || raw;
}

/** "62 / 130 hours", "12 hours so far", or nothing. The unit is the author's
 *  own word when they gave one, else the kind's — localized and inflected. */
function countText(meta: TrackerMeta): string | null {
  if (meta.done === null) return null;
  const kind: TrackerKind | null = foldKind(meta.kind);
  const known = unitKey(meta.unit);
  const phrase = (n: number): string =>
    known !== null
      ? countPhrase(n, known)
      : meta.unit !== null
        ? `${localeNum(n)} ${meta.unit}`
        : kind
          ? countPhrase(n, KIND_UNIT[kind])
          : localeNum(n);
  if (meta.total === null) return tf("mediaSoFar", { count: phrase(meta.done) });
  return `${localeNum(meta.done)} / ${phrase(meta.total)}`;
}

// ── One card ────────────────────────────────────────────────────────────────

function MediaCard({
  meta,
  locale,
  onOpen,
  onEdit,
  onStep,
  onFolder,
  onOpenPath,
}: {
  meta: TrackerMeta;
  locale: string;
  onOpen: () => void;
  onEdit: () => void;
  onStep: (delta: number) => void;
  onFolder: () => void;
  onOpenPath: (path: string) => void;
}) {
  const [coverBroken, setCoverBroken] = useState(false);
  useEffect(() => setCoverBroken(false), [meta.cover]);
  const percent = meta.percent === null ? null : Math.max(0, Math.min(100, meta.percent));
  const count = countText(meta);
  const dates: string[] = [];
  if (meta.started) dates.push(tf("trackerStarted", { date: dateText(meta.started, locale) }));
  if (meta.finished) dates.push(tf("trackerFinished", { date: dateText(meta.finished, locale) }));
  return (
    <article className={`s-media__card s-media__card--${meta.status}`} dir={autoDir(meta.title)}>
      {/* The cover and the title are ONE door to the note: a card is a
          thing you open, and the two biggest marks on it are the handle. */}
      <button type="button" className="s-media__open" onClick={onOpen} aria-label={tf("mediaOpenNote", { title: meta.title })}>
        <span className="s-media__cover">
          {meta.cover && !coverBroken ? (
            <img className="s-media__coverimg" src={/^https:\/\//i.test(meta.cover) ? meta.cover : fileUrl(meta.cover)} alt="" loading="lazy" draggable={false} onError={() => setCoverBroken(true)} />
          ) : (
            <span className="s-media__coverfall">
              <FolderGlyph icon={meta.icon} size={36} />
            </span>
          )}
          {meta.season && <span className="s-media__season">{tf("mediaSeason", { n: localeNum(Number(meta.season) || 0) || meta.season })}</span>}
        </span>
        <span className="s-media__title" dir="auto">{meta.title}</span>
      </button>
      {percent !== null && (
        <div
          className="s-media__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          aria-label={t("trackerProgress")}
        >
          <span className="s-media__fill" style={{ inlineSize: `${percent}%` }} />
        </div>
      )}
      <div className="s-media__meta">
        {percent !== null && <span className="s-media__pct">{tf("trackerPercent", { percent: localeNum(Math.round(percent)) })}</span>}
        {count && <span className="s-media__count" dir="auto">{count}</span>}
        {percent !== null && percent >= 100 && <span className="s-media__flourish" title={t("trackerComplete")}>✦</span>}
      </div>
      <div className="s-media__line">
        <span className={`s-media__status s-media__status--${meta.status}`}>
          {meta.status !== "planned" && meta.status !== "active" && <span className="s-media__dot" />}
          {t(STATUS_LABEL[meta.status])}
        </span>
        {meta.rating && (
          <span
            className="s-media__rating"
            role="img"
            aria-label={tf("trackerRating", { value: localeNum(Math.round(meta.rating.value * 10) / 10), max: localeNum(meta.rating.max) })}
          >
            ★ {localeNum(Math.round(meta.rating.value * 10) / 10)}
          </span>
        )}
      </div>
      {dates.length > 0 && <div className="s-media__dates">{dates.join(" · ")}</div>}
      {meta.folder && (
        /* The work's own notes: a folder of the vault behind the card. The
           chip counts them and is the door — the folder's own note when it
           has one, else the folder revealed in the tree. */
        <button type="button" className="s-media__folder" onClick={onFolder} title={meta.folder} aria-label={tf("mediaFolderOpen", { title: meta.title })}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          <span dir="auto">{tf("mediaFolderNotes", { count: countPhrase(meta.folderNotes, "notes"), folder: meta.folder.split("/").pop() ?? meta.folder })}</span>
        </button>
      )}
      {meta.folder && meta.folderRecent.length > 0 && (
        /* The last notes touched under the folder: the work's own history,
           newest first, each a door. Three is a strip, not a list. */
        <div className="s-media__recent">
          <span className="s-media__recenthead">{t("mediaRecentNotes")}</span>
          <ul className="s-media__recentlist">
            {meta.folderRecent.map((n) => (
              <li key={n.path}>
                <button type="button" className="s-media__recentnote" onClick={() => onOpenPath(n.path)} title={n.path}>
                  <bdi className="s-media__recenttitle">{n.title}</bdi>
                  <span className="s-media__recentwhen">{relativeDate(n.mtimeMs, locale, { dateStyle: "medium" })}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {meta.notes && <p className="s-media__notes" dir="auto">{meta.notes}</p>}
      <div className="s-media__actions">
        <button type="button" className="s-media__stepbtn" onClick={() => onStep(-1)} aria-label={t("trackerStepDown")} title={t("trackerStepDown")} disabled={meta.done === null}>
          −
        </button>
        <button type="button" className="s-media__stepbtn" onClick={() => onStep(1)} aria-label={t("trackerStepUp")} title={t("trackerStepUp")} disabled={meta.done === null}>
          +
        </button>
        <button type="button" className="s-media__editbtn" onClick={onEdit} aria-label={tf("mediaEditTitle", { title: meta.title })} title={tf("mediaEditTitle", { title: meta.title })}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
            <path d="M13.5 6.5l3 3" />
          </svg>
          <span>{t("mediaEdit")}</span>
        </button>
      </div>
    </article>
  );
}

// ── The page ────────────────────────────────────────────────────────────────

export default function MediaView() {
  useStore((s) => s.language);
  const locale = useStore((s) => s.blogLocale);
  const openNote = useStore((s) => s.openNote);
  const setView = useStore((s) => s.setView);
  const [all, setAll] = useState<TrackerMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<TrackerStatus | null>(null);
  const [form, setForm] = useState<{ open: false } | { open: true; editing: TrackerMeta | null }>({ open: false });

  const load = useCallback(() => {
    void getTrackers()
      .then((list) => {
        setAll(list);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
    // A vault event is a coalesced "something moved"; the shelf is cheap to
    // re-read and it is the only way an edit made in the editor reaches
    // this page while it is open.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 250);
    };
    window.addEventListener(VAULT_EVENT, onVault);
    return () => {
      window.removeEventListener(VAULT_EVENT, onVault);
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  const shelves = useMemo(() => shelve(all ?? [], status), [all, status]);
  const total = all?.length ?? 0;

  const open = (meta: TrackerMeta): void => {
    openNote(meta.path);
    setView("editor");
  };

  const openFolder = (meta: TrackerMeta): void => {
    if (meta.folder === null) return;
    if (meta.folderNote !== null) {
      openNote(meta.folderNote);
      setView("editor");
      return;
    }
    // No note stands for the folder: show it in the tree instead, with the
    // pane open first — the same order the palette's own reveal keeps.
    const store = useStore.getState();
    if (sidebarIsDrawer()) store.setSidebarOpen(true);
    else store.setSidebarCollapsed(false);
    const path = meta.folder;
    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(TREE_REVEAL_EVENT, { detail: { path } })));
  };

  const step = async (meta: TrackerMeta, delta: number): Promise<void> => {
    // Paint the nudge before the round trip: the bar is the feel of the
    // feature, and a bar that waits for the server reads as a bar that did
    // not hear the press.
    setAll((list) =>
      list?.map((m) => {
        if (m !== meta || m.done === null) return m;
        const done = Math.max(0, m.total === null ? m.done + delta : Math.min(m.total, m.done + delta));
        const percent = m.total === null ? m.percent : (done / m.total) * 100;
        return { ...m, done, percent };
      }) ?? null,
    );
    try {
      await updateTracker(meta.path, meta.index, null, delta);
    } catch {
      toast(tf("mediaSaveFailed", { title: meta.title }), "error");
    }
    load();
  };

  return (
    <div className="s-media" data-testid="media-page">
      <header className="s-media__head">
        <div className="s-media__headtext">
          <h1 className="s-media__h1">{t("media")}</h1>
          <p className="s-media__lead">{t("mediaLead")}</p>
        </div>
        <button type="button" className="s-btn s-btn--accent s-media__addbtn" onClick={() => setForm({ open: true, editing: null })}>
          {t("mediaAdd")}
        </button>
      </header>
      {total > 0 && (
        <div className="s-media__filters" role="radiogroup" aria-label={t("mediaFilterAria")}>
          {[null, ...STATUS_FILTERS].map((value) => {
            const on = value === status;
            return (
              <button
                key={value ?? "all"}
                type="button"
                role="radio"
                aria-checked={on}
                className={`s-media__filter${on ? " s-media__filter--on" : ""}`}
                onClick={() => setStatus(value)}
              >
                {value === null ? t("mediaFilterAll") : t(STATUS_LABEL[value])}
              </button>
            );
          })}
        </div>
      )}
      {failed ? (
        <p className="s-media__empty">{t("mediaFailed")}</p>
      ) : all !== null && total === 0 ? (
        <div className="s-media__empty">
          <span className="s-media__emptystar" aria-hidden="true">✦</span>
          <p className="s-media__emptytext">{t("mediaEmpty")}</p>
          <p className="s-media__emptyhint">{t("mediaEmptyHint")}</p>
        </div>
      ) : (
        shelves.map(({ shelf, items }) => (
          <section key={shelf} className="s-media__shelf" aria-labelledby={`s-media-shelf-${shelf}`}>
            <h2 className="s-media__shelfhead" id={`s-media-shelf-${shelf}`}>
              <span className="s-media__shelfglyph"><FolderGlyph icon={SHELF_ICON[shelf]} size={16} /></span>
              <span>{t(SHELF_LABEL[shelf])}</span>
              <span className="s-media__shelfcount">{localeNum(items.length)}</span>
            </h2>
            <div className="s-media__grid">
              {items.map((meta) => (
                <MediaCard
                  key={`${meta.path}::${meta.index}`}
                  meta={meta}
                  locale={locale}
                  onOpen={() => open(meta)}
                  onFolder={() => openFolder(meta)}
                  onOpenPath={(path) => {
                    openNote(path);
                    setView("editor");
                  }}
                  onEdit={() => setForm({ open: true, editing: meta })}
                  onStep={(delta) => void step(meta, delta * meta.step)}
                />
              ))}
            </div>
          </section>
        ))
      )}
      {form.open && (
        <MediaForm
          editing={form.editing}
          onClose={() => setForm({ open: false })}
          onSaved={() => {
            setForm({ open: false });
            load();
          }}
        />
      )}
    </div>
  );
}
