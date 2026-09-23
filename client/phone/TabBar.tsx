// The five doors: Today, Notes, Search, Calendar, More. Labelled — an icon
// alone is a riddle, and the audit counted four unlabelled icons in the old
// drawer's header. 56px plus the home indicator's inset on a phone; on a
// tablet the same five stand in a 72px rail down the leading edge.
//
// A tap on the tab you are on takes it back to its root (nav.ts
// `switchTab`), the gesture every phone app has taught its readers.

import type { ReactNode } from "react";
import { t, type I18nKey } from "../i18n.ts";
import { usePhone } from "./context.ts";
import { IconCalendar, IconMore, IconNotes, IconSearch, IconToday } from "./icons.tsx";
import type { TabId } from "./nav.ts";

const TAB_DEF: { id: TabId; key: I18nKey; icon: () => ReactNode }[] = [
  { id: "today", key: "phTabToday", icon: IconToday },
  { id: "notes", key: "phTabNotes", icon: IconNotes },
  { id: "search", key: "phTabSearch", icon: IconSearch },
  { id: "calendar", key: "calendar", icon: IconCalendar },
  { id: "more", key: "phTabMore", icon: IconMore },
];

export default function TabBar({ rail = false }: { rail?: boolean }) {
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
    </nav>
  );
}
