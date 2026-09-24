// SETTINGS, ON A PHONE: a list of sections, each a pushed screen.
//
// The desktop's panel is a dialog with a rail beside one scrolling form; on a
// phone the audit found it a full-screen sheet whose rail had become a strip
// of truncated tabs ("Publishing & co") over a desktop-dense form. Here the
// rail IS the screen — one 52px row per section, its one-sentence intro
// under its name — and a section is a screen of its own
// (./SettingsSectionScreen.tsx) with its own Save. The search the panel keeps
// above its rail keeps its place above the list, and a hit opens the section
// with the row it found marked.
//
// `openSettingsAt(row)` from anywhere in the product (the moderation panel's
// "comments are closed", Backup & sync's badge) lands here with the row in
// `settingsFocus`; this screen carries it on to the row's section.

import { useEffect, useMemo, useRef, useState } from "react";
import { POCKET_HIDDEN_TABS, TABS } from "../../components/settings/tabs.ts";
import { searchSettings } from "../../components/settings/searchSettings.ts";
import { SETTINGS_INDEX } from "../../components/settings/settingsIndex.ts";
import { t } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import { usePhone } from "../context.ts";
import { IconChevron } from "../icons.tsx";
import TopBar from "../TopBar.tsx";
import { useScrollMemory } from "../useScrollMemory.ts";

export default function SettingsScreen({ onBack }: { onBack?: () => void }) {
  const phone = usePhone();
  const pocket = useStore((s) => s.pocket);
  const focus = useStore((s) => s.settingsFocus);
  useStore((s) => s.language);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useScrollMemory(scrollRef);
  const sections = useMemo(() => (pocket ? TABS.filter((s) => !POCKET_HIDDEN_TABS.has(s.id)) : TABS), [pocket]);
  const hits = useMemo(() => (query.trim() === "" ? [] : searchSettings(query, undefined, pocket)), [query, pocket]);
  const open = (section: string): void => phone.open({ kind: "settings", section });
  // On a tablet the section open beside this list is lit in it.
  const top = phone.state.stacks[phone.state.tab].at(-1);
  const current = top?.kind === "settings" && top.section !== "" ? top.section : null;

  // A row asked for from elsewhere: open its section; the section marks it.
  useEffect(() => {
    if (focus === null) return;
    const entry = SETTINGS_INDEX.find((row) => row.label === focus);
    if (entry === undefined || !sections.some((s) => s.id === entry.tab)) {
      useStore.setState({ settingsFocus: null });
      return;
    }
    open(entry.tab);
    // The section clears `settingsFocus` once it has marked the row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <div className="s-ph-screen s-ph-settings" data-screen="settings">
      <TopBar title={t("siteSettings")} onBack={onBack} onTitle={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })} />
      <div className="s-ph-scroll" ref={scrollRef}>
        <div className="s-ph-search__bar s-ph-search__bar--flat">
          <input
            className="s-ph-field"
            type="search"
            value={query}
            placeholder={t("settingsSearchPlaceholder")}
            aria-label={t("settingsSearchPlaceholder")}
            dir={query === "" ? undefined : "auto"}
            spellCheck={false}
            enterKeyHint="search"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {query.trim() !== "" ? (
          hits.length === 0 ? (
            <p className="s-ph-empty">{t("settingsSearchNone")}</p>
          ) : (
            <ul className="s-ph-list" aria-label={t("settingsSearchPlaceholder")}>
              {hits.map((hit) => (
                <li key={`${hit.entry.tab}/${hit.entry.label}`}>
                  <button
                    type="button"
                    className="s-ph-row s-ph-hit"
                    onClick={() => {
                      useStore.setState({ settingsFocus: hit.entry.label });
                      setQuery("");
                    }}
                  >
                    <span className="s-ph-hit__text">
                      <bdi className="s-ph-row__name" dir="auto">{hit.label}</bdi>
                      <span className="s-ph-hit__snippet">{t(TABS.find((x) => x.id === hit.entry.tab)?.key ?? "siteSettings")}</span>
                    </span>
                    <span className="s-ph-row__chev" aria-hidden="true">
                      <IconChevron />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <ul className="s-ph-list" aria-label={t("settingsSections")}>
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`s-ph-row s-ph-hit${current === s.id ? " s-ph-row--on" : ""}`}
                  data-section={s.id}
                  aria-current={current === s.id ? "page" : undefined}
                  onClick={() => open(s.id)}
                >
                  <span className="s-ph-hit__text">
                    <span className="s-ph-row__name">{t(s.key)}</span>
                    <span className="s-ph-hit__snippet">{t(pocket && s.id === "sync" ? "pocketSyncNote" : s.intro)}</span>
                  </span>
                  <span className="s-ph-row__chev" aria-hidden="true">
                    <IconChevron />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
