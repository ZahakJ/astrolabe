// MENTIONS: what other sites said about a published page (docs/webmentions.md)
// — under the comments, drawn by MentionsSection.tsx only when there is
// something to show. Likes and
// reposts are rows of faces (each a link to the person's own site), replies
// and mentions read like comments with the site they were written on. Every
// entry here was either approved by the owner in the moderation panel
// (webmentions, fediverse replies) or is a like or a boost from the fediverse.
//
// Everything in it came from another server: names are plain text (React
// escapes them, <bdi> isolates them), links are http(s) only, pictures load
// without a referrer and lazily.

import type { CommentData } from "../../shared/types.ts";
import { siteDate } from "../dates.ts";
import { countPhrase, t } from "../i18n.ts";
import { useStore } from "../state.ts";
import { safeHref, shortUrl } from "./mentionsApi.ts";
import "./mentions.css";

function Face({ m }: { m: CommentData }) {
  const href = safeHref(m.authorUrl ?? m.url ?? m.source);
  const photo = safeHref(m.photo);
  const initial = [...(m.author.trim() || "?")][0].toUpperCase();
  const inner = photo ? (
    <img className="s-mentions__img" src={photo} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
  ) : (
    <span className="s-mentions__initial" aria-hidden="true">{initial}</span>
  );
  return (
    <li className="s-mentions__face">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc" title={m.author} aria-label={m.author}>
          {inner}
        </a>
      ) : (
        <span title={m.author} aria-label={m.author} role="img">{inner}</span>
      )}
    </li>
  );
}

export default function Mentions({ items }: { items: CommentData[] }) {
  const locale = useStore((s) => s.blogLocale);
  useStore((s) => s.language); // chrome strings follow a live language switch
  if (items.length === 0) return null;
  const likes = items.filter((m) => m.type === "like");
  const reposts = items.filter((m) => m.type === "repost");
  const words = items.filter((m) => m.type === "reply" || m.type === "mention");

  return (
    <section className="s-mentions" aria-label={t("mentionsTitle")}>
      <header className="s-marginalia__header">
        <h2 className="s-marginalia__title">{t("mentionsTitle")}</h2>
      </header>
      {likes.length > 0 && (
        <div className="s-mentions__row">
          <span className="s-mentions__label">{countPhrase(likes.length, "likes")}</span>
          <ul className="s-mentions__faces">{likes.map((m) => <Face key={m.id} m={m} />)}</ul>
        </div>
      )}
      {reposts.length > 0 && (
        <div className="s-mentions__row">
          <span className="s-mentions__label">{countPhrase(reposts.length, "reposts")}</span>
          <ul className="s-mentions__faces">{reposts.map((m) => <Face key={m.id} m={m} />)}</ul>
        </div>
      )}
      {words.length > 0 && (
        <ul className="s-marginalia__list">
          {words.map((m) => {
            const author = safeHref(m.authorUrl);
            const where = safeHref(m.url ?? m.source);
            return (
              <li key={m.id} className="s-comment s-mentions__entry">
                <div className="s-comment__meta">
                  {author ? (
                    <a className="s-comment__author s-mentions__author" href={author} target="_blank" rel="noopener noreferrer nofollow ugc" dir="auto">
                      {m.author}
                    </a>
                  ) : (
                    <span className="s-comment__author" dir="auto">{m.author}</span>
                  )}
                  <time className="s-comment__time" dateTime={new Date(m.createdMs).toISOString()}>
                    {siteDate(new Date(m.createdMs), locale, { month: "short", day: "numeric", year: "numeric" })}
                  </time>
                  <span className="s-comment__chip">{t(m.type === "reply" ? "mentionReplied" : "mentionMentioned")}</span>
                </div>
                {m.body && <p className="s-comment__body" dir="auto">{m.body}</p>}
                {where && (
                  <a className="s-mentions__via" href={where} target="_blank" rel="noopener noreferrer nofollow ugc" dir="ltr">
                    {shortUrl(where)}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
