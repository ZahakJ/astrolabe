// SERIES on the blog (shared/series.ts): the card line, the bar above a
// part's title, and the app-rendered "Parts" section of a series page. The
// server already decided everything — which parts this reader may see, their
// order, the series' newest date — so this file only sets type.

import type { PostMeta, SeriesPlanEntry } from "../../shared/types.ts";
import { countPhrase, localeNum, t, tf, type I18nKey } from "../i18n.ts";
import { MetaSep } from "../metaSep.tsx";
import { notePathToUrl } from "../router.ts";
import { formatDate, NavLink } from "./util.tsx";

/** A post by path, looking inside series cards too: GET /api/posts lists a
 *  series as one card and carries its parts in `partList`, so the article
 *  page of a part finds its metadata there. */
export function findPost(posts: readonly PostMeta[] | null, path: string): PostMeta | null {
  if (!posts) return null;
  for (const post of posts) {
    if (post.path === path) return post;
    const part = post.partList?.find((p) => p.path === path);
    if (part) return part;
  }
  return null;
}

/** "· Series · 7 parts" — set exactly like the reading-time item it follows. */
export function SeriesMeta({ post }: { post: PostMeta }) {
  if (!post.parts) return null;
  return (
    <>
      <MetaSep className="s-blog-meta__dot" />
      <span className="s-blog-meta__series">
        {t("blogSeries")}
        <MetaSep className="s-blog-meta__dot" />
        {countPhrase(post.parts, "seriesParts")}
      </span>
    </>
  );
}

/** The parts of a series, inline on its CARD in the home, topic and folder
 *  lists: the series stays one card (fourteen parts do not bury the rest of
 *  the site), and the parts are in view and one click away all the same —
 *  the owner's call on 2026-10-07 ("1": keep the card, show the parts).
 *  Number, title, reading time; nothing the full Parts section on the series
 *  page does not say better. */
export function SeriesCardParts({ post }: { post: PostMeta }) {
  const parts = post.partList;
  if (!parts || parts.length === 0) return null;
  return (
    <ol className="s-blog-card-parts" aria-label={t("blogSeries")}>
      {parts.map((part, i) => (
        <li key={part.path} className="s-blog-card-parts__item">
          <span className="s-blog-card-parts__n" aria-hidden="true">
            {localeNum(i + 1)}
          </span>
          <NavLink url={notePathToUrl(part.path)} className="s-blog-card-parts__title" dir="auto">
            {part.title}
          </NavLink>
          <span className="s-blog-card-parts__time">{countPhrase(part.readingMinutes, "readMinutes")}</span>
        </li>
      ))}
    </ol>
  );
}

/** "Part 3 of 7 · ‹series›", above a part's title. */
export function SeriesBar({ part }: { part: PostMeta }) {
  const s = part.series;
  if (!s) return null;
  return (
    <p className="s-blog-series-bar">
      <span>{tf("blogSeriesPartOf", { n: localeNum(s.index), count: localeNum(s.count) })}</span>
      <MetaSep className="s-blog-meta__dot" />
      <NavLink url={notePathToUrl(s.path)} dir="auto">
        {s.title}
      </NavLink>
    </p>
  );
}

const STATUS_KEY: Record<SeriesPlanEntry["status"], I18nKey | null> = {
  published: null,
  unpublished: "blogSeriesUnpublished",
  missing: "blogSeriesMissing",
  self: "blogSeriesSelf",
  nested: "blogSeriesNested",
  claimed: "blogSeriesClaimed",
};

/** The series page's "Parts": numbered, with excerpt, reading time and date.
 *  For the owner, the whole plan — entries that are not visible parts stay in
 *  their place, greyed, saying why. */
export function SeriesParts({ series, locale, admin }: { series: PostMeta; locale: string; admin: boolean }) {
  const visible = series.partList ?? [];
  const byPath = new Map(visible.map((p) => [p.path, p]));
  type Row = { key: string; part: PostMeta | null; title: string; note: I18nKey | null };
  const rows: Row[] =
    admin && series.seriesPlan
      ? series.seriesPlan.map((e, i) => {
          const part = e.path !== null && e.status === "published" ? (byPath.get(e.path) ?? null) : null;
          return { key: `${i}:${e.ref}`, part, title: part?.title ?? e.title, note: part ? null : STATUS_KEY[e.status] };
        })
      : visible.map((p) => ({ key: p.path, part: p, title: p.title, note: null }));
  if (rows.length === 0) return null;
  let n = 0;
  return (
    <section className="s-blog-series" aria-label={t("blogSeriesParts")}>
      <h2 className="s-blog-heading">
        <span>{t("blogSeriesParts")}</span>
      </h2>
      <ol className="s-blog-series__list">
        {rows.map((row) => {
          const part = row.part;
          const num = part ? localeNum(++n) : "";
          return (
            <li key={row.key} className={part ? "s-blog-series__item" : "s-blog-series__item s-blog-series__item--off"}>
              <span className="s-blog-series__num" aria-hidden={part ? undefined : true}>
                {num}
              </span>
              <div className="s-blog-series__body">
                {part ? (
                  <NavLink url={notePathToUrl(part.path)} className="s-blog-related__link" dir="auto">
                    {part.title}
                  </NavLink>
                ) : (
                  <span className="s-blog-series__title" dir="auto">
                    {row.title}
                  </span>
                )}
                {part ? (
                  <>
                    {part.excerpt !== "" && (
                      <p className="s-blog-series__excerpt" dir="auto">
                        {part.excerpt}
                      </p>
                    )}
                    <div className="s-blog-meta">
                      <time className="s-blog-meta__date" dateTime={part.date}>
                        {formatDate(part.date, locale)}
                      </time>
                      <MetaSep className="s-blog-meta__dot" />
                      <span>{countPhrase(part.readingMinutes, "readMinutes")}</span>
                    </div>
                  </>
                ) : (
                  row.note && <div className="s-blog-meta">{t(row.note)}</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Previous/next PART, in series order, for a part's footer. */
export function seriesNeighbours(
  posts: readonly PostMeta[] | null,
  part: PostMeta | null,
): { prev: PostMeta | null; next: PostMeta | null } | null {
  if (!part?.series || !posts) return null;
  const list = posts.find((p) => p.path === part.series!.path)?.partList ?? [];
  const i = list.findIndex((p) => p.path === part.path);
  if (i < 0) return null;
  return { prev: list[i - 1] ?? null, next: list[i + 1] ?? null };
}
