// The five doors: Today, Notes, Search, Calendar, More. Labelled — an icon
// alone is a riddle, and the audit counted four unlabelled icons in the old
// drawer's header. 56px plus the home indicator's inset on a phone; on two
// columns (client/shellQuery.ts SPLIT_QUERY) the same five stand in a 72px
// rail down the leading edge — and, while a note is open beside a list, a
// sixth at the rail's foot: ⟨ steps the list aside so the note takes the
// page, ⟩ brings it back (remembered on the device, PhoneShell.tsx).
//
// A tap on the tab you are on takes it back to its root (nav.ts
// `switchTab`), the gesture every phone app has taught its readers.

import type { ReactNode } from "react";
import { t, type I18nKey } from "../i18n.ts";
import { usePhone } from "./context.ts";
import { IconBack, IconCalendar, IconChevron, IconMore, IconNotes, IconSearch, IconToday } from "./icons.tsx";
import type { TabId } from "./nav.ts";

const TAB_DEF: { id: TabId; key: I18nKey; icon: () => ReactNode }[] = [
  { id: "today", key: "phTabToday", icon: IconToday },
  { id: "notes", key: "phTabNotes", icon: IconNotes },
  { id: "search", key: "phTabSearch", icon: IconSearch },
  { id: "calendar", key: "calendar", icon: IconCalendar },
  { id: "more", key: "phTabMore", icon: IconMore },
];

export interface ListToggle {
  hidden: boolean;
  toggle: () => void;
}

export default function TabBar({ rail = false, list }: { rail?: boolean; list?: ListToggle }) {
  const phone = usePhone();
  const current = phone.state.tab;
  return (
    <nav className={rail ? "s-ph-rail" : "s-ph-tabs"} aria-label={t("phTabsLabel")}>
      {TAB_DEF.map(({ id, key, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={`s-ph-tab${current === id ? " s-ph-tab--on" : ""}`}
          aria-current={current === id ? "page" : undefined}
          data-tab={id}
          onClick={() => phone.nav.switchTab(id)}
        >
          <span className="s-ph-tab__icon">
            <Icon />
          </span>
          <span className="s-ph-tab__label">{t(key)}</span>
        </button>
      ))}
      {rail && list && (
        <button
          type="button"
          className="s-ph-tab s-ph-rail__list"
          data-action="list-toggle"
          data-list={list.hidden ? "hidden" : "shown"}
          aria-expanded={!list.hidden}
          onClick={list.toggle}
        >
          <span className="s-ph-tab__icon">{list.hidden ? <IconChevron /> : <IconBack />}</span>
          <span className="s-ph-tab__label">{t(list.hidden ? "phShowList" : "phHideList")}</span>
        </button>
      )}
    </nav>
  );
}
