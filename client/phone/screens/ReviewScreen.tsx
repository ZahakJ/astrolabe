// THE WEEKLY REVIEW, as a screen: the week added up — sigils, pages, cards
// and notes — under a phone top bar. The review is a printable page of
// figures and lists that already stacks to one column; what it needed from
// the phone was a way in and out that is a screen and not a workspace tab.

import ReviewWeekView from "../../review/ReviewWeekView.tsx";
import { t } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import TopBar from "../TopBar.tsx";

export default function ReviewScreen({ onBack }: { onBack: () => void }) {
  useStore((s) => s.language);
  return (
    <div className="s-ph-screen s-ph-review" data-screen="review-week">
      <TopBar title={t("reviewWeek")} onBack={onBack} />
      <div className="s-ph-scroll s-ph-review__body">
        <ReviewWeekView />
      </div>
    </div>
  );
}
