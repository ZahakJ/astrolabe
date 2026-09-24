// The words and dates both Feeds shells print (docs/feeds.md).

import type { FeedProblemReason } from "../../shared/feeds.ts";
import { relativeDate } from "../dates.ts";
import { t, type I18nKey } from "../i18n.ts";
import { useStore } from "../state.ts";

/** An item's date: "3 hours ago" inside a month, the date after. */
export function feedDate(ms: number): string {
  return relativeDate(ms, useStore.getState().blogLocale, { dateStyle: "medium" });
}

/** Each thing the list note can get wrong, in the reader's language. */
export const PROBLEM_KEY: Record<FeedProblemReason, I18nKey> = {
  notAnAddress: "feedsProblemNotAnAddress",
  duplicate: "feedsProblemDuplicate",
  badFolder: "feedsProblemBadFolder",
  tooMany: "feedsProblemTooMany",
  tagBeforeNothing: "feedsProblemTagBeforeNothing",
};

/** The list note a reader starts from: a heading, one line saying how, and
 *  an empty fence. The fence word is the same in every language; the line
 *  is in the chrome's. */
export function starterList(): string {
  return `# ${t("feeds")}\n\n${t("feedsStarterLine")}\n\n\`\`\`feeds\n\`\`\`\n`;
}
