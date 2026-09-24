// ONE FEED ITEM, ON A PHONE: the article in the reading face under the top
// bar, and its verbs in the ⋯ sheet — Keep first, then Mark read, Open the
// original, and (once kept) the kept note. The article is the server's
// sanitised HTML (shared/feedHtml.ts), set by the same prose rules the
// desktop's reader wears (client/styles/feeds.css).

import { t } from "../../i18n.ts";
import { feedDate } from "../../feeds/feedsCopy.ts";
import { itemKey, useFeeds } from "../../feeds/useFeeds.ts";
import { useStore } from "../../state.ts";
import { useActionSheet, type ActionRow } from "../ActionSheet.tsx";
import { usePhone } from "../context.ts";
import { IconDots } from "../icons.tsx";
import TopBar from "../TopBar.tsx";
import "../../styles/feeds.css";

export default function FeedItemScreen({ feed, guid, onBack }: { feed: string; guid: string; onBack: () => void }) {
  const phone = usePhone();
  useStore((s) => s.language);
  const key = itemKey({ feed, guid });
  const model = useFeeds(key, (p) => phone.open({ kind: "note", path: p }, "push"));
  const actions = useActionSheet();
  const item = model.item;
  const listed = model.items.find((i) => itemKey(i) === key);
  const read = listed?.read ?? item?.read ?? false;
  const kept = listed?.kept ?? item?.kept ?? null;
  const feedTitle = model.state?.feeds.find((f) => f.url === feed)?.title ?? "";

  const openSheet = (): void => {
    const rows: ActionRow[] = [
      { label: model.keeping ? t("feedsKeeping") : kept ? t("feedsKeptButton") : t("feedsKeep"), onSelect: () => void model.keep(key) },
      { label: read ? t("feedsMarkUnread") : t("feedsMarkRead"), onSelect: () => void model.setRead(!read, key) },
    ];
    if (item?.url) rows.push({ label: t("feedsOpenOriginal"), onSelect: () => model.openOriginal(key) });
    if (kept) rows.push({ label: t("feedsOpenKept"), onSelect: () => phone.open({ kind: "note", path: kept }, "push") });
    actions(item?.title ?? t("feeds"), rows);
  };

  return (
    <div className="s-ph-screen s-ph-feeditem" data-screen="feed-item" data-guid={guid}>
      <TopBar
        title={feedTitle}
        userTitle
        onBack={onBack}
        actions={
          <button type="button" className="s-ph-icon" aria-label={t("phMore")} onClick={openSheet} disabled={item === null} data-action="feed-more">
            <IconDots />
          </button>
        }
      />
      <div className="s-ph-scroll">
        {model.itemFailed ? (
          <p className="s-ph-empty">{t("feedsItemFailed")}</p>
        ) : item === null ? (
          <p className="s-ph-empty">{t("loading")}</p>
        ) : (
          <article className="s-ph-feeditem__article" aria-label={item.title}>
            <p className="s-ph-feeditem__byline">
              {item.author && <bdi dir="auto">{item.author}</bdi>}
              {item.author && item.published !== null && " · "}
              {item.published !== null && feedDate(item.published)}
              {kept && ` · ${t("feedsKeptMark")}`}
            </p>
            <h1 className="s-ph-feeditem__title" dir="auto">
              {item.title}
            </h1>
            {item.summaryOnly && <p className="s-ph-foot">{model.state?.fetch ? t("feedsSummaryOnly") : t("feedsSummaryOnlyOff")}</p>}
            <div className="s-feeds__prose" dir="auto" dangerouslySetInnerHTML={{ __html: item.html }} />
          </article>
        )}
      </div>
    </div>
  );
}
