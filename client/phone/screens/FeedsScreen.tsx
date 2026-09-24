// FEEDS, ON A PHONE: the unread items as rows under their feed's heading,
// newest first, and an item as a screen of its own (./FeedItemScreen.tsx)
// with Keep in its ⋯ sheet. The same model as the desktop's tab
// (client/feeds/useFeeds.ts); the chrome is the phone's — 44px rows, the top
// bar's refresh, the list remembering where it was scrolled.

import { useRef } from "react";
import { localeNum, t, tf } from "../../i18n.ts";
import { feedDate, PROBLEM_KEY } from "../../feeds/feedsCopy.ts";
import { feedsStatusLine, itemKey, useFeeds } from "../../feeds/useFeeds.ts";
import { putNote } from "../../api.ts";
import { starterList } from "../../feeds/feedsCopy.ts";
import { useStore } from "../../state.ts";
import { toast } from "../../toast.ts";
import { usePhone } from "../context.ts";
import { IconChevron } from "../icons.tsx";
import TopBar from "../TopBar.tsx";
import { useScrollMemory } from "../useScrollMemory.ts";

export default function FeedsScreen({ onBack }: { onBack?: () => void }) {
  const phone = usePhone();
  useStore((s) => s.language);
  const model = useFeeds(null, (p) => phone.open({ kind: "note", path: p }, "push"));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useScrollMemory(scrollRef);
  const state = model.state;

  const start = async (): Promise<void> => {
    if (!state) return;
    try {
      await putNote(state.note, starterList());
      phone.open({ kind: "note", path: state.note }, "push");
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : t("feedsStartFailed"), "error");
    }
  };

  return (
    <div className="s-ph-screen s-ph-feeds" data-screen="feeds">
      <TopBar title={t("feeds")} onBack={onBack} onTitle={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })} />
      <div className="s-ph-scroll" ref={scrollRef}>
        {state && <p className="s-ph-foot s-ph-feeds__status">{feedsStatusLine(state)}</p>}
        {state && (state.problems.length > 0 || state.feeds.some((f) => f.error)) && (
          <ul className="s-ph-feeds__problems">
            {state.problems.map((p) => (
              <li key={`p${p.line}`}>{tf(PROBLEM_KEY[p.reason], { line: localeNum(p.line), text: p.text })}</li>
            ))}
            {state.feeds
              .filter((f) => f.error)
              .map((f) => (
                <li key={f.url}>{tf("feedsFeedFailed", { feed: f.title, error: f.error ?? "" })}</li>
              ))}
          </ul>
        )}
        {model.failed ? (
          <p className="s-ph-empty">{t("feedsFailed")}</p>
        ) : state === null ? (
          <p className="s-ph-empty">{t("loading")}</p>
        ) : !state.noteExists ? (
          <div className="s-ph-empty">
            <p>{tf("feedsNoNote", { note: state.note })}</p>
            <button type="button" className="s-ph-btn s-ph-btn--accent" onClick={() => void start()}>
              {tf("feedsStartNote", { note: state.note })}
            </button>
          </div>
        ) : state.feeds.length === 0 ? (
          <p className="s-ph-empty">{tf("feedsNoFeeds", { note: state.note })}</p>
        ) : model.order.length === 0 ? (
          <p className="s-ph-empty">{state.fetch ? t("feedsAllRead") : t("feedsNothingYetOff")}</p>
        ) : (
          model.groups.map(({ feed, items }) => (
            <section key={feed.url} aria-label={feed.title}>
              <h2 className="s-ph-head">
                <bdi dir="auto">{feed.title}</bdi>
                <span className="s-ph-head__count">{localeNum(items.filter((i) => !i.read).length)}</span>
              </h2>
              <ul className="s-ph-list">
                {items.map((it) => (
                  <li key={itemKey(it)}>
                    <button
                      type="button"
                      className={`s-ph-row${it.read ? " s-ph-row--read" : ""}`}
                      data-feed-item={it.guid}
                      onClick={() => phone.open({ kind: "feed-item", feed: it.feed, guid: it.guid })}
                    >
                      <span className="s-ph-hit__text">
                        <bdi className="s-ph-row__name" dir="auto">
                          {it.title}
                        </bdi>
                        <span className="s-ph-hit__snippet">
                          {it.published !== null && feedDate(it.published)}
                          {it.kept && ` · ${t("feedsKeptMark")}`}
                        </span>
                      </span>
                      <span className="s-ph-row__chev" aria-hidden="true">
                        <IconChevron />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        {state && (
          <div className="s-ph-feeds__tools">
            {state.fetch ? (
              <button type="button" className="s-ph-btn" onClick={() => void model.refresh()} disabled={model.refreshing}>
                {model.refreshing ? t("feedsChecking") : t("feedsRefresh")}
              </button>
            ) : (
              <button type="button" className="s-ph-btn" onClick={() => phone.open({ kind: "settings", section: "vault" })}>
                {t("feedsTurnOn")}
              </button>
            )}
            {state.noteExists && (
              <button type="button" className="s-ph-btn" onClick={() => phone.open({ kind: "note", path: state.note }, "push")}>
                {t("feedsEditList")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
