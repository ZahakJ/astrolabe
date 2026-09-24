// ONE DECK: what is due, what is new, and Study.
//
// The desktop shelf's card, read top to bottom as a phone reads: the three
// counts as the page's figures, one Study button a thumb cannot miss, the
// deck's sections as rows (a textbook's chapters in one note — study one on
// its own), and the month's retention under them. Study pushes the session
// (./SessionScreen.tsx), which takes the whole glass; its own "back to the
// shelf" returns here (PhoneShell's store → stack sync walks back down to the
// deck rather than stacking a second shelf). The note itself is in ⋯.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DeckMeta } from "../../../shared/decks.ts";
import { isoDate } from "../../../shared/routine.ts";
import { getDecks } from "../../api.ts";
import { countPhrase, localeNum, t, tf } from "../../i18n.ts";
import { readLog, retention, studyDays } from "../../orbits/log.ts";
import { streakOf } from "../../orbits/stats.ts";
import { st, stf } from "../../orbits/copy.ts";
import { useStore } from "../../state.ts";
import { orbitsTabFor } from "../../workspace.ts";
import { useActionSheet } from "../ActionSheet.tsx";
import { usePhone } from "../context.ts";
import { IconChevron, IconDots } from "../icons.tsx";
import TopBar from "../TopBar.tsx";
import { useVaultTick } from "../../vaultTick.ts";
import { deckTitle } from "./OrbitsScreen.tsx";

export default function DeckScreen({ path, onBack }: { path: string; onBack: () => void }) {
  const phone = usePhone();
  const actions = useActionSheet();
  useStore((s) => s.language);
  const tick = useVaultTick();
  const today = isoDate(new Date());
  const [meta, setMeta] = useState<DeckMeta | null | "gone">(null);

  useEffect(() => {
    let live = true;
    getDecks(today)
      .then((list) => live && setMeta(list.find((m) => m.path === path) ?? "gone"))
      .catch(() => live && setMeta("gone"));
    return () => {
      live = false;
    };
  }, [path, today, tick]);

  const log = useMemo(() => readLog(), [tick]);
  const kept = useMemo(() => (meta && meta !== "gone" ? retention(log, today, 30, meta.implicit ? null : meta.path) : null), [log, today, meta]);
  const streak = useMemo(() => streakOf(studyDays(log), today), [log, today]);
  const study = useCallback(
    (section: string | null) => phone.open({ kind: "surface", tab: orbitsTabFor(path, section) }, "push"),
    [phone, path],
  );

  if (meta === null) return <Frame title="" onBack={onBack}><p className="s-ph-empty">{t("loading")}</p></Frame>;
  if (meta === "gone") return <Frame title="" onBack={onBack}><p className="s-ph-empty">{st("orbitsGone")}</p></Frame>;

  const title = deckTitle(meta);
  const sections = meta.sections.filter((s) => s.total > 0);
  const menu = (): void =>
    actions(title, meta.implicit ? [] : [{ label: st("orbitsOpenNote"), onSelect: () => phone.open({ kind: "note", path: meta.path }, "push") }]);

  return (
    <Frame
      title={title}
      onBack={onBack}
      actions={
        !meta.implicit ? (
          <button type="button" className="s-ph-icon" aria-label={t("phMore")} onClick={menu}>
            <IconDots />
          </button>
        ) : undefined
      }
    >
      <div className="s-ph-deck__hero">
        <span className="s-ph-deck__icon" aria-hidden="true">{meta.icon ?? (meta.implicit ? "∗" : "✦")}</span>
        {meta.implicit && <p className="s-ph-deck__hint">{st("orbitsEverythingHint")}</p>}
        <dl className="s-ph-figures">
          <div className={`s-ph-figure${meta.counts.due > 0 ? " s-ph-figure--lit" : ""}`}>
            <dt>{st("orbitsDueLabel")}</dt>
            <dd>{localeNum(meta.counts.due)}</dd>
          </div>
          <div className="s-ph-figure">
            <dt>{st("orbitsNewLabel")}</dt>
            <dd>{localeNum(meta.counts.new)}</dd>
          </div>
          <div className="s-ph-figure">
            <dt>{st("orbitsTotalLabel")}</dt>
            <dd>{localeNum(meta.counts.total)}</dd>
          </div>
        </dl>
        <button type="button" className="s-ph-btn s-ph-btn--accent s-ph-btn--wide" data-action="study" disabled={meta.counts.total === 0} onClick={() => study(null)}>
          {st("orbitsStudy")}
        </button>
        <p className="s-ph-deck__line">
          {kept === null ? st("orbitsNoGrades") : `${st("orbitsRetention30")}: ${stf("orbitsPercent", { n: localeNum(Math.round(kept * 100)) })}`}
          {streak > 0 ? ` · ${stf("orbitsStreak", { days: countPhrase(streak, "days") })}` : ""}
        </p>
      </div>
      {sections.length > 0 && (
        <section aria-label={st("orbitsStudySection")}>
          <h2 className="s-ph-head">{st("orbitsStudySection")}</h2>
          <ul className="s-ph-list">
            {sections.map((s) => (
              <li key={s.name}>
                <button type="button" className="s-ph-row" onClick={() => study(s.name)}>
                  <bdi className="s-ph-row__name" dir="auto">{s.name}</bdi>
                  <span className={`s-ph-row__count${s.due > 0 ? " s-ph-row__count--due" : ""}`}>{tf("phCardsDue", { n: localeNum(s.due) })}</span>
                  <span className="s-ph-row__chev" aria-hidden="true">
                    <IconChevron />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Frame>
  );
}

function Frame({ title, onBack, actions, children }: { title: string; onBack: () => void; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="s-ph-screen s-ph-deck" data-screen="deck">
      <TopBar title={title} userTitle onBack={onBack} actions={actions} />
      <div className="s-ph-scroll">{children}</div>
    </div>
  );
}
