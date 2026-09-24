// FEEDS — the desktop's tab (docs/feeds.md). The unread items of the feeds
// the list names, grouped by feed, newest first, in a column; the item open
// in a reader beside it with the three verbs. A lazy chunk with its own
// sheet, like the weekly review.
//
// The keys are the surface's own and outside the global ledger (the book
// reader's precedent, docs/keymap.md "Feeds"): `j`/`k` step, `o` opens the
// original, `e` marks read and steps on — answered by the surface's own
// listener, so they exist only while focus is inside it, and resolved by
// physical position (client/keys.ts) so they work on an Arabic layout.

import { useEffect, useRef } from "react";
import type { FeedItemFull } from "../../shared/feeds.ts";
import { putNote } from "../api.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { feedsKey, feedsStatusLine, itemKey, useFeeds, type FeedsModel } from "./useFeeds.ts";
import { feedDate, PROBLEM_KEY, starterList } from "./feedsCopy.ts";
import "../styles/feeds.css";

export function FeedReader({ model, item }: { model: FeedsModel; item: FeedItemFull }) {
  const key = itemKey(item);
  const read = model.items.find((i) => itemKey(i) === key)?.read ?? item.read;
  const kept = model.items.find((i) => itemKey(i) === key)?.kept ?? item.kept;
  const feed = model.state?.feeds.find((f) => f.url === item.feed);
  return (
    <article className="s-feeds__article" aria-label={item.title} data-testid="feeds-article">
      <header className="s-feeds__head">
        <p className="s-feeds__byline">
          <bdi dir="auto">{feed?.title ?? item.feed}</bdi>
          {item.author && (
            <>
              {" · "}
              <bdi dir="auto">{item.author}</bdi>
            </>
          )}
          {item.published !== null && ` · ${feedDate(item.published)}`}
        </p>
        <h1 className="s-feeds__title" dir="auto">
          {item.title}
        </h1>
        <div className="s-feeds__actions">
          <button type="button" className="s-btn s-btn--accent" onClick={() => void model.keep(key)} disabled={model.keeping} data-testid="feeds-keep">
            {model.keeping ? t("feedsKeeping") : kept ? t("feedsKeptButton") : t("feedsKeep")}
          </button>
          <button type="button" className="s-btn" onClick={() => void model.setRead(!read, key)} data-testid="feeds-read">
            {read ? t("feedsMarkUnread") : t("feedsMarkRead")}
          </button>
          {item.url && (
            <button type="button" className="s-btn" onClick={() => model.openOriginal(key)}>
              {t("feedsOpenOriginal")}
            </button>
          )}
          {kept && (
            <button type="button" className="s-btn" onClick={() => useStore.getState().openNote(kept)}>
              {t("feedsOpenKept")}
            </button>
          )}
        </div>
        {item.summaryOnly && <p className="s-feeds__note">{model.state?.fetch ? t("feedsSummaryOnly") : t("feedsSummaryOnlyOff")}</p>}
      </header>
      {/* Sanitised on the server (shared/feedHtml.ts): an allowlist of
          tags, http(s) addresses only, images lazy and referrer-free. */}
      <div className="s-feeds__prose" dir="auto" dangerouslySetInnerHTML={{ __html: item.html }} />
    </article>
  );
}

/** The column of items, grouped by feed. `onPick` is what a row does. */
export function FeedList({ model, onPick }: { model: FeedsModel; onPick: (key: string) => void }) {
  return (
    <>
      {model.groups.map(({ feed, items }) => (
        <section key={feed.url} className="s-feeds__group" aria-label={feed.title}>
          <h2 className="s-feeds__feed">
            <bdi dir="auto">{feed.title}</bdi>
            <span className="s-feeds__count">{localeNum(items.filter((i) => !i.read).length)}</span>
          </h2>
          <ul className="s-feeds__items">
            {items.map((it) => {
              const key = itemKey(it);
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`s-feeds__row${it.read ? " s-feeds__row--read" : ""}`}
                    aria-current={model.selected === key ? "true" : undefined}
                    onClick={() => onPick(key)}
                    data-feed-item={it.guid}
                  >
                    <bdi className="s-feeds__rowtitle" dir="auto">
                      {it.title}
                    </bdi>
                    <span className="s-feeds__rowmeta">
                      {it.published !== null && feedDate(it.published)}
                      {it.kept && ` · ${t("feedsKeptMark")}`}
                    </span>
                    {it.excerpt && (
                      <span className="s-feeds__excerpt" dir="auto">
                        {it.excerpt}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

/** What stands in for the list when there is nothing to list — the reasons
 *  in the order a reader meets them. */
export function FeedsEmpty({ model, onStart }: { model: FeedsModel; onStart: () => void }) {
  const state = model.state;
  if (model.failed) return <p className="s-feeds__empty">{t("feedsFailed")}</p>;
  if (state === null) return null;
  if (!state.noteExists) {
    return (
      <div className="s-feeds__empty">
        <p>{tf("feedsNoNote", { note: state.note })}</p>
        <button type="button" className="s-btn s-btn--accent" onClick={onStart} data-testid="feeds-start">
          {tf("feedsStartNote", { note: state.note })}
        </button>
      </div>
    );
  }
  if (state.feeds.length === 0) return <p className="s-feeds__empty">{tf("feedsNoFeeds", { note: state.note })}</p>;
  if (model.order.length === 0) return <p className="s-feeds__empty">{state.fetch ? t("feedsAllRead") : t("feedsNothingYetOff")}</p>;
  return null;
}

type Opener = (path: string) => void;

/** Make the list note, with an empty fence and one line saying how. */
export async function startFeedsNote(note: string, open: Opener): Promise<void> {
  try {
    await putNote(note, starterList());
    open(note);
  } catch (err) {
    toast(err instanceof Error && err.message ? err.message : t("feedsStartFailed"), "error");
  }
}

export default function FeedsView() {
  const model = useFeeds();
  useStore((s) => s.language);
  const root = useRef<HTMLDivElement | null>(null);
  const state = model.state;

  // The selected row follows the keys into view.
  useEffect(() => {
    if (model.selected === null) return;
    const row = root.current?.querySelector<HTMLElement>(".s-feeds__row[aria-current='true']");
    row?.scrollIntoView({ block: "nearest" });
  }, [model.selected]);

  const problems = state?.problems ?? [];
  const failing = state?.feeds.filter((f) => f.error !== null) ?? [];

  return (
    <div className="s-feeds" ref={root} tabIndex={-1} onKeyDown={(e) => feedsKey(e, model)} data-testid="feeds">
      <header className="s-feeds__bar">
        <h1 className="s-feeds__name">{t("feeds")}</h1>
        {state && <span className="s-feeds__status">{feedsStatusLine(state)}</span>}
        <span className="s-feeds__tools">
          {state?.fetch && (
            <button type="button" className="s-btn" onClick={() => void model.refresh()} disabled={model.refreshing} data-testid="feeds-refresh">
              {model.refreshing ? t("feedsChecking") : t("feedsRefresh")}
            </button>
          )}
          {state && !state.fetch && (
            <button type="button" className="s-btn" onClick={() => useStore.getState().openSettingsAt("rowFeeds")}>
              {t("feedsTurnOn")}
            </button>
          )}
          {state?.noteExists && (
            <button type="button" className="s-btn" onClick={() => useStore.getState().openNote(state.note)}>
              {t("feedsEditList")}
            </button>
          )}
        </span>
      </header>
      {(problems.length > 0 || failing.length > 0) && (
        <ul className="s-feeds__problems" aria-label={t("feedsProblems")}>
          {problems.map((p) => (
            <li key={`p${p.line}`}>{tf(PROBLEM_KEY[p.reason], { line: localeNum(p.line), text: p.text })}</li>
          ))}
          {failing.map((f) => (
            <li key={f.url}>
              {tf("feedsFeedFailed", { feed: f.title, error: f.error ?? "" })}
            </li>
          ))}
        </ul>
      )}
      <div className="s-feeds__cols">
        <nav className="s-feeds__list" aria-label={t("feedsUnread")}>
          <FeedsEmpty model={model} onStart={() => state && void startFeedsNote(state.note, (p) => useStore.getState().openNote(p)).then(model.load)} />
          <FeedList model={model} onPick={model.select} />
        </nav>
        <div className="s-feeds__reader">
          {model.item ? (
            <FeedReader model={model} item={model.item} />
          ) : model.itemFailed ? (
            <p className="s-feeds__empty">{t("feedsItemFailed")}</p>
          ) : model.selected === null && model.order.length > 0 ? (
            <p className="s-feeds__empty s-feeds__hint">{t("feedsPickHint")}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
