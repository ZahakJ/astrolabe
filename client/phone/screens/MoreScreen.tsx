// MORE — everything that is not a daily door, as a grouped list.
//
// The old phone's "More" was the desktop's tool cluster poured into a
// 13-row dropdown: Command palette above Media, "Vim keybindings — off" beside
// the graph, the version number as a row. Here it is four groups a reader can
// scan — the vault's other rooms, the vault's housekeeping, the public site,
// the session — and a fifth that exists only once a hardware keyboard has
// been seen, because vim, zen and a sheet of shortcuts are keyboard things.

import type { ReactNode } from "react";
import { openDesigner } from "../../components/design/openDesigner.ts";
import { openThemePicker } from "../../components/ThemePicker.tsx";
import { t } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import { choiceLabel } from "../../themes.ts";
import { openTour } from "../../tour.ts";
import { GRAPH_TAB, MEDIA_TAB, ORBITS_TAB, REVIEW_WEEK_TAB, ROUTINES_TAB } from "../../workspace.ts";
import { usePhone } from "../context.ts";
import { IconChevron } from "../icons.tsx";
import TopBar from "../TopBar.tsx";

declare const __APP_VERSION__: string;
const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";

function Item({ label, note, onClick, chevron = true, danger = false }: { label: string; note?: ReactNode; onClick: () => void; chevron?: boolean; danger?: boolean }) {
  return (
    <li>
      <button type="button" className={`s-ph-row${danger ? " s-ph-row--danger" : ""}`} onClick={onClick}>
        <span className="s-ph-row__name">{label}</span>
        {note !== undefined && <span className="s-ph-row__note">{note}</span>}
        {chevron && (
          <span className="s-ph-row__chev" aria-hidden="true">
            <IconChevron />
          </span>
        )}
      </button>
    </li>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="s-ph-group" aria-label={title}>
      <h2 className="s-ph-head">{title}</h2>
      <ul className="s-ph-list s-ph-list--grouped">{children}</ul>
    </section>
  );
}

export default function MoreScreen() {
  const phone = usePhone();
  const admin = useStore((s) => s.admin);
  const pocket = useStore((s) => s.pocket);
  const theme = useStore((s) => s.theme);
  const vim = useStore((s) => s.vimMode);
  const zen = useStore((s) => s.zen);
  useStore((s) => s.language);
  const store = useStore.getState;
  const surface = (tab: string) => () => phone.open({ kind: "surface", tab });
  // Settings is a list of pushed sections (./SettingsScreen.tsx); Backup &
  // sync and About are two of them, reached in one tap from here.
  const settings = (section: string) => () => phone.open({ kind: "settings", section });

  return (
    <div className="s-ph-screen s-ph-more" data-screen="more">
      <TopBar title={t("phTabMore")} />
      <div className="s-ph-scroll">
        <Group title={t("phRooms")}>
          {admin && <Item label={t("orbits")} onClick={surface(ORBITS_TAB)} />}
          {admin && <Item label={t("routines")} onClick={surface(ROUTINES_TAB)} />}
          <Item label={t("bookLibrary")} onClick={surface("~library")} />
          {admin && <Item label={t("media")} onClick={surface(MEDIA_TAB)} />}
          {admin && <Item label={t("reviewWeek")} onClick={surface(REVIEW_WEEK_TAB)} />}
          <Item label={t("docTitleGraph")} onClick={surface(GRAPH_TAB)} />
        </Group>
        {admin && (
          <Group title={t("phVault")}>
            <Item label={t("trashBrowser")} onClick={() => store().setTrashOpen(true)} />
            <Item label={t("siteSettings")} onClick={settings("")} />
            <Item label={t("phBackupSync")} onClick={settings("sync")} />
            <Item label={t("themePicker")} note={<bdi>{choiceLabel(theme)}</bdi>} onClick={openThemePicker} />
          </Group>
        )}
        {admin && !pocket && (
          <Group title={t("phSite")}>
            <Item label={t("designTitle")} onClick={openDesigner} />
            <Item label={t("phPreviewVisitor")} onClick={() => void store().setPreviewVisitor(true)} />
          </Group>
        )}
        {phone.keyboard && admin && (
          <Group title={t("phKeyboard")}>
            <Item label={t("rowVimKeys")} note={t(vim ? "on" : "off")} chevron={false} onClick={() => store().toggleVim()} />
            <Item label={t("phZen")} note={t(zen ? "on" : "off")} chevron={false} onClick={() => store().setZen(!zen)} />
            <Item label={t("keyShortcuts")} onClick={() => store().setShortcutsOpen(true)} />
          </Group>
        )}
        <Group title={t("phSession")}>
          <Item label={t("phTour")} onClick={openTour} />
          <Item label={t("tabAbout")} note={APP_VERSION ? <bdi dir="ltr">{APP_VERSION}</bdi> : undefined} onClick={() => (admin ? settings("about")() : undefined)} chevron={admin} />
          {admin ? (
            <Item label={t("signOut")} chevron={false} danger onClick={() => void store().logout()} />
          ) : (
            <Item label={t("signIn")} chevron={false} onClick={() => store().setLoginOpen(true)} />
          )}
        </Group>
      </div>
    </div>
  );
}
