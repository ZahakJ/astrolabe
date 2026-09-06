// THE LIBRARY'S THREE PAGES: the shelf (`/library`), a path (`/library/<slug>`)
// and a lesson (`/library/<slug>/<n>`). One module, loaded lazily by both
// public shells, because the pages share the shelf, the progress and the
// outline, and because a visitor reading a post should not download them.
//
// The reading experience is the point. A lesson is not a post: it has no
// date, no tags, no comments and no "related" — it has a PLACE, which the
// page says at the top ("Lesson 7 of 24 · Lecture 3"), draws down the side
// (the path's outline with this lesson lit and the read ones ticked) and
// offers at the foot (the previous and the next lesson, as two doors). The
// arrow keys walk it. Opening a lesson marks it read, in this browser only.

import { useEffect, useMemo, useRef, useState } from "react";
import { stripBidiControls } from "../../shared/bidi.ts";
import { libraryUrl } from "../../shared/library.ts";
import { noteTitleOf } from "../../shared/noteFormat.ts";
import type { LibraryPath, LibraryUnit } from "../../shared/types.ts";
import { getNote } from "../api.ts";
import { countPhrase, localeNum, t, tf } from "../i18n.ts";
import { renderNoteContent } from "../reading/renderNote.ts";
import { numberRendered } from "../reading/headingNumbers.ts";
import { applyNoteLayoutTo } from "../textLayout.ts";
import { useStore } from "../state.ts";
import { go } from "../blog/nav.ts";
import { resolveLink } from "../editor/links.ts";
import { BlogSkeleton, NavLink } from "../blog/util.tsx";
import LibraryCover, { kindLabel } from "./LibraryCover.tsx";
import AnnotationsMount from "../annotations/AnnotationsMount.tsx";
import { clearProgress, markRead, stepsOf, useLibrary, useProgress, type LessonStep } from "./libraryData.ts";
import "../reading/reading.css";
import "../styles/library-band.css";
import "../styles/library.css";

import { type LibraryRoute } from "./libraryRoute.ts";

/** "Lecture 3", "Chapter 40", "Week 2", "Part 1", the folder's own name, or
 *  "Introduction" for the notes at a path's root. */
export function unitLabel(unit: LibraryUnit): string {
  if (unit.kind === "intro") return t("libraryIntro");
  if (unit.number !== null) {
    const n = localeNum(unit.number);
    if (unit.kind === "lecture") return tf("libraryUnitLecture", { n });
    if (unit.kind === "chapter") return tf("libraryUnitChapter", { n });
    if (unit.kind === "week") return tf("libraryUnitWeek", { n });
    if (unit.kind === "part") return tf("libraryUnitPart", { n });
  }
  return unit.name;
}

/** The unit's name beyond its number, when it has one: `Chapter 40` says
 *  nothing more, but `L3 Primary-backup replication` does. */
function unitSubtitle(unit: LibraryUnit): string | null {
  if (unit.kind === "intro" || unit.number === null) return null;
  const rest = unit.name.replace(/^[^\d]*\d+\s*[-–—:.]?\s*/, "").trim();
  return rest !== "" && rest.toLowerCase() !== unit.name.toLowerCase() ? rest : null;
}

function hours(minutes: number): string {
  if (minutes < 60) return countPhrase(minutes, "readMinutes");
  return tf("libraryHours", { count: localeNum(Math.round(minutes / 60)) });
}

export default function LibraryRouter({ route }: { route: LibraryRoute }) {
  useStore((s) => s.language);
  const shelf = useLibrary();
  if (route.kind === "library") return <Shelf shelf={shelf} />;
  if (shelf === null) return <BlogSkeleton rows={4} />;
  const path = shelf.find((p) => p.slug === route.slug) ?? null;
  if (!path) return <MissingPath />;
  if (route.kind === "libraryPath") return <PathPage path={path} />;
  return <LessonPage path={path} n={route.n} />;
}

function MissingPath() {
  return (
    <div className="s-blog-page s-blog-locked">
      <div className="s-blog-locked__glyph" aria-hidden="true">
        ✦
      </div>
      <p className="s-blog-locked__title">{t("libraryMissing")}</p>
      <NavLink url={libraryUrl()} className="s-btn s-btn--accent">
        {t("libraryAll")}
      </NavLink>
    </div>
  );
}

// ── The shelf ───────────────────────────────────────────────────────────────

function Shelf({ shelf }: { shelf: LibraryPath[] | null }) {
  const door = useStore((s) => s.library);
  const title = door?.title || t("libraryTitle");
  const groups = useMemo(() => {
    const books = (shelf ?? []).filter((p) => p.kind === "book");
    const courses = (shelf ?? []).filter((p) => p.kind === "course");
    const series = (shelf ?? []).filter((p) => p.kind === "series");
    return [
      { key: "course", label: t("libraryCourses"), items: courses },
      { key: "book", label: t("libraryBooks"), items: books },
      { key: "series", label: t("librarySeries"), items: series },
    ].filter((g) => g.items.length > 0);
  }, [shelf]);
  return (
    <div className="s-blog-page s-lib">
      <header className="s-lib__head">
        <h1 className="s-lib__title">{title}</h1>
        {shelf && shelf.length > 0 && (
          <p className="s-lib__lede">
            {tf("libraryLede", {
              paths: localeNum(shelf.length),
              lessons: localeNum(shelf.reduce((sum, p) => sum + p.lessons, 0)),
            })}
          </p>
        )}
      </header>
      {shelf === null ? (
        <BlogSkeleton rows={3} />
      ) : shelf.length === 0 ? (
        <p className="s-lib__empty">{t("libraryEmpty")}</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="s-lib__group" aria-label={group.label}>
            {groups.length > 1 && <h2 className="s-lib__grouphead">{group.label}</h2>}
            <div className={`s-lib__grid s-lib__grid--${group.key}`}>
              {group.items.map((path) => (
                <ShelfCard key={path.id} path={path} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function ShelfCard({ path }: { path: LibraryPath }) {
  const { done, last } = useProgress(path);
  const steps = stepsOf(path);
  const at = last ? steps.find((s) => s.lesson.path === last) : undefined;
  const pct = path.lessons === 0 ? 0 : Math.round((done / path.lessons) * 100);
  return (
    <NavLink url={libraryUrl(path.slug)} className={`s-lib-card s-lib-card--${path.kind}`}>
      <LibraryCover title={path.title} kind={path.kind} cover={path.cover} size="card" />
      <span className="s-lib-card__body">
        <span className="s-lib-card__kind">{kindLabel(path.kind)}</span>
        <span className="s-lib-card__title" dir="auto">
          {path.title}
        </span>
        {path.blurb && (
          <span className="s-lib-card__blurb" dir="auto">
            {path.blurb}
          </span>
        )}
        <span className="s-lib-card__meta">
          <span>{countPhrase(path.lessons, "lessons")}</span>
          <span className="s-lib-card__dot" aria-hidden="true">
            ·
          </span>
          <span>{hours(path.minutes)}</span>
        </span>
        <span className="s-lib-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span className="s-lib-progress__bar" style={{ inlineSize: `${pct}%` }} />
        </span>
        <span className="s-lib-card__state">
          {done === 0
            ? t("libraryStart")
            : done >= path.lessons
              ? t("libraryDone")
              : at
                ? tf("libraryContinue", { n: localeNum(at.n) })
                : tf("libraryProgress", { done: localeNum(done), total: localeNum(path.lessons) })}
        </span>
      </span>
    </NavLink>
  );
}

// ── A path ──────────────────────────────────────────────────────────────────

function PathPage({ path }: { path: LibraryPath }) {
  const { read, done, last } = useProgress(path);
  const steps = stepsOf(path);
  const at = last ? steps.find((s) => s.lesson.path === last) : undefined;
  const next = at ? (steps[at.n] ?? at) : steps[0];
  const pct = path.lessons === 0 ? 0 : Math.round((done / path.lessons) * 100);
  return (
    <div className="s-blog-page s-lib s-lib-path">
      <nav className="s-lib-crumbs" aria-label={t("libraryTitle")}>
        <NavLink url={libraryUrl()}>{useStore.getState().library?.title || t("libraryTitle")}</NavLink>
      </nav>
      <header className={`s-lib-hero s-lib-hero--${path.kind}`}>
        <LibraryCover title={path.title} kind={path.kind} cover={path.cover} size="hero" />
        <div className="s-lib-hero__body">
          <p className="s-lib-hero__kind">{kindLabel(path.kind)}</p>
          <h1 className="s-lib-hero__title" dir="auto">
            {path.title}
          </h1>
          {path.blurb && (
            <p className="s-lib-hero__blurb" dir="auto">
              {path.blurb}
            </p>
          )}
          <p className="s-lib-hero__meta">
            <span>{countPhrase(path.units.filter((u) => u.kind !== "intro").length, "units")}</span>
            <span className="s-lib-card__dot" aria-hidden="true">
              ·
            </span>
            <span>{countPhrase(path.lessons, "lessons")}</span>
            <span className="s-lib-card__dot" aria-hidden="true">
              ·
            </span>
            <span>{hours(path.minutes)}</span>
            {path.source && (
              <>
                <span className="s-lib-card__dot" aria-hidden="true">
                  ·
                </span>
                <a className="s-lib-hero__source" href={path.source} target="_blank" rel="noopener noreferrer">
                  {t("librarySource")} ↗
                </a>
              </>
            )}
          </p>
          <div className="s-lib-hero__actions">
            {next && (
              <NavLink url={libraryUrl(path.slug, next.n)} className="s-btn s-btn--accent s-lib-hero__go">
                {done === 0 ? t("libraryStart") : done >= path.lessons ? t("libraryReadAgain") : tf("libraryContinue", { n: localeNum(next.n) })}
              </NavLink>
            )}
            <span className="s-lib-hero__progress">
              <span className="s-lib-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <span className="s-lib-progress__bar" style={{ inlineSize: `${pct}%` }} />
              </span>
              <span className="s-lib-hero__count">{tf("libraryProgress", { done: localeNum(done), total: localeNum(path.lessons) })}</span>
            </span>
            {done > 0 && (
              <button type="button" className="s-lib-hero__forget" onClick={() => clearProgress(path.slug)}>
                {t("libraryForget")}
              </button>
            )}
          </div>
        </div>
      </header>
      <section className="s-lib-syllabus" aria-label={t("libraryContents")}>
        {path.units.map((unit) => (
          <div key={unit.key} className="s-lib-unit">
            <h2 className="s-lib-unit__head">
              <span className="s-lib-unit__label">{unitLabel(unit)}</span>
              {unitSubtitle(unit) && (
                <span className="s-lib-unit__name" dir="auto">
                  {unitSubtitle(unit)}
                </span>
              )}
            </h2>
            <ol className="s-lib-unit__list">
              {unit.lessons.map((lesson) => {
                const step = steps.find((s) => s.lesson.path === lesson.path);
                if (!step) return null;
                const isRead = read.has(lesson.path);
                return (
                  <li key={lesson.path}>
                    <NavLink
                      url={libraryUrl(path.slug, step.n)}
                      className={`s-lib-lesson-row${isRead ? " s-lib-lesson-row--read" : ""}${last === lesson.path ? " s-lib-lesson-row--last" : ""}`}
                    >
                      <span className="s-lib-lesson-row__n">{isRead ? "✓" : localeNum(step.n)}</span>
                      <span className="s-lib-lesson-row__title" dir="auto">
                        {lesson.title}
                      </span>
                      <span className="s-lib-lesson-row__min">{countPhrase(lesson.readingMinutes, "readMinutes")}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </section>
    </div>
  );
}

// ── A lesson ────────────────────────────────────────────────────────────────

function dropDuplicateTitle(root: HTMLElement, title: string): void {
  const h1 = root.querySelector(".s-rv-h1");
  if (h1 && (h1.textContent ?? "").trim().toLowerCase() === title.trim().toLowerCase()) h1.remove();
}

/** The lesson a rendered wikilink points at, if the note is on any shelf. */
function lessonUrlFor(target: string, shelf: LibraryPath[] | null): string | null {
  if (!shelf) return null;
  const notePath = resolveLink(target, useStore.getState().tree);
  if (!notePath) return null;
  for (const p of shelf) {
    for (const step of stepsOf(p)) if (step.lesson.path === notePath) return libraryUrl(p.slug, step.n);
  }
  return null;
}

function LessonPage({ path, n }: { path: LibraryPath; n: number }) {
  const steps = useMemo(() => stepsOf(path), [path]);
  const step: LessonStep | undefined = steps[n - 1];
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const shelf = useLibrary();

  // A link to another lesson stays in the library. Capture phase, so this
  // answers before the renderer's own onRootClick opens the note's page.
  useEffect(() => {
    const host = bodyRef.current;
    if (!host) return;
    const onClick = (ev: MouseEvent): void => {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey) return;
      const wl = (ev.target as HTMLElement).closest<HTMLElement>(".s-rv-wikilink");
      if (!wl || wl.dataset.book !== undefined || !wl.dataset.target) return;
      const url = lessonUrlFor(wl.dataset.target, shelf);
      if (!url) return;
      ev.preventDefault();
      ev.stopPropagation();
      go(url);
    };
    host.addEventListener("click", onClick, true);
    return () => host.removeEventListener("click", onClick, true);
  }, [shelf]);
  const [annHost, setAnnHost] = useState<HTMLElement | null>(null);
  const admin = useStore((s) => s.admin);
  // Whether the rail stands beside the column (wide) or folds above it. A
  // container query styles the grid, but a closed <details> renders nothing
  // whatever the stylesheet says, so the fold's open state has to know the
  // width too: measured here, once per resize.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWide(el.clientWidth >= 980));
    ro.observe(el);
    setWide(el.clientWidth >= 980);
    return () => ro.disconnect();
  }, []);
  const [failed, setFailed] = useState(false);
  const { read } = useProgress(path);
  const language = useStore((s) => s.language);
  const lessonPath = step?.lesson.path ?? null;
  const title = lessonPath ? stripBidiControls(noteTitleOf(lessonPath)) : "";

  useEffect(() => {
    const host = bodyRef.current;
    if (!host || !lessonPath) return;
    let disposed = false;
    setFailed(false);
    getNote(lessonPath)
      .then((note) => {
        if (disposed || !bodyRef.current) return;
        const el = renderNoteContent(note.content, {
          notePath: lessonPath,
          tree: useStore.getState().tree,
          brokenLinks: "plain",
          missingImages: "card",
        });
        el.classList.add("s-reading__content");
        applyNoteLayoutTo(el, note.content);
        dropDuplicateTitle(el, title);
        numberRendered(el, note.content, { frontmatterOnly: true });
        bodyRef.current.replaceChildren(el);
        // Read, from this browser's point of view, once the words are on
        // the screen — not when the URL was typed.
        markRead(path.slug, lessonPath);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
    };
  }, [lessonPath, title, path.slug, language]);

  // The page opens at its top: the previous lesson's scroll position is not
  // this one's, and the shell's own scroll restoration is for going BACK.
  useEffect(() => {
    document.querySelector<HTMLElement>(".s-blog-main, .s-dsn")?.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [lessonPath]);

  // ← and → walk the path, mirrored in an RTL shell; typing in a field is
  // left alone.
  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const rtl = document.documentElement.getAttribute("dir") === "rtl";
      const forward = rtl ? "ArrowLeft" : "ArrowRight";
      const back = rtl ? "ArrowRight" : "ArrowLeft";
      if (e.key === forward && steps[step.n]) go(libraryUrl(path.slug, step.n + 1));
      else if (e.key === back && step.n > 1) go(libraryUrl(path.slug, step.n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, steps, path.slug]);

  if (!step) return <MissingPath />;
  const prev = steps[step.n - 2];
  const next = steps[step.n];
  const libraryName = useStore.getState().library?.title || t("libraryTitle");
  return (
    <div className="s-lib-lesson-wrap" ref={wrapRef}>
    <div className="s-lib-lesson">
      <aside className="s-lib-rail" aria-label={t("libraryContents")}>
        <details
          className="s-lib-rail__fold"
          open={wide || railOpen}
          onToggle={(e) => {
            if (!wide) setRailOpen((e.currentTarget as HTMLDetailsElement).open);
          }}
        >
          <summary className="s-lib-rail__summary">
            <span className="s-lib-rail__path" dir="auto">
              {path.title}
            </span>
            <span className="s-lib-rail__count">{tf("libraryLessonOf", { n: localeNum(step.n), total: localeNum(steps.length) })}</span>
          </summary>
          <div className="s-lib-rail__body">
            {path.units.map((unit) => (
              <div key={unit.key} className="s-lib-rail__unit">
                <p className="s-lib-rail__unithead">{unitLabel(unit)}</p>
                <ol className="s-lib-rail__list">
                  {unit.lessons.map((lesson) => {
                    const s = steps.find((x) => x.lesson.path === lesson.path);
                    if (!s) return null;
                    const isRead = read.has(lesson.path);
                    const here = s.n === step.n;
                    return (
                      <li key={lesson.path}>
                        <NavLink
                          url={libraryUrl(path.slug, s.n)}
                          className={`s-lib-rail__item${here ? " s-lib-rail__item--here" : ""}${isRead ? " s-lib-rail__item--read" : ""}`}
                          aria-current={here ? "page" : undefined}
                        >
                          <span className="s-lib-rail__n">{isRead && !here ? "✓" : localeNum(s.n)}</span>
                          <span className="s-lib-rail__title" dir="auto">
                            {lesson.title}
                          </span>
                        </NavLink>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        </details>
      </aside>
      <article className="s-lib-lesson__main">
        <nav className="s-lib-crumbs" aria-label={libraryName}>
          <NavLink url={libraryUrl()}>{libraryName}</NavLink>
          <span className="s-lib-crumbs__sep" aria-hidden="true">
            ›
          </span>
          <NavLink url={libraryUrl(path.slug)}>
            <bdi>{path.title}</bdi>
          </NavLink>
        </nav>
        <p className="s-lib-lesson__kicker">
          <span>{tf("libraryLessonOf", { n: localeNum(step.n), total: localeNum(steps.length) })}</span>
          <span className="s-lib-card__dot" aria-hidden="true">
            ·
          </span>
          <span>{unitLabel(step.unit)}</span>
          <span className="s-lib-card__dot" aria-hidden="true">
            ·
          </span>
          <span>{countPhrase(step.lesson.readingMinutes, "readMinutes")}</span>
        </p>
        <h1 className="s-lib-lesson__title" dir="auto">
          {title}
        </h1>
        {failed ? (
          <p className="s-lib__empty">{t("blogNoPage")}</p>
        ) : (
          <div
            className="s-lib-lesson__body s-reading"
            ref={(el) => {
              bodyRef.current = el;
              setAnnHost(el);
            }}
          >
            <BlogSkeleton rows={4} />
          </div>
        )}
        {lessonPath && <AnnotationsMount path={lessonPath} host={annHost} canEdit={admin} scope="l" />}
        <nav className="s-lib-turn" aria-label={t("libraryContents")}>
          {prev ? (
            <NavLink url={libraryUrl(path.slug, prev.n)} className="s-lib-turn__card s-lib-turn__card--prev">
              <span className="s-lib-turn__label">{t("libraryPrev")}</span>
              <span className="s-lib-turn__title" dir="auto">
                {prev.lesson.title}
              </span>
            </NavLink>
          ) : (
            <span className="s-lib-turn__card s-lib-turn__card--empty" />
          )}
          {next ? (
            <NavLink url={libraryUrl(path.slug, next.n)} className="s-lib-turn__card s-lib-turn__card--next">
              <span className="s-lib-turn__label">{t("libraryNext")}</span>
              <span className="s-lib-turn__title" dir="auto">
                {next.lesson.title}
              </span>
            </NavLink>
          ) : (
            <NavLink url={libraryUrl(path.slug)} className="s-lib-turn__card s-lib-turn__card--next s-lib-turn__card--done">
              <span className="s-lib-turn__label">{t("libraryDone")}</span>
              <span className="s-lib-turn__title" dir="auto">
                {path.title}
              </span>
            </NavLink>
          )}
        </nav>
        <p className="s-lib-lesson__keys">{t("libraryKeysHint")}</p>
      </article>
    </div>
    </div>
  );
}
