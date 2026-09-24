// ORBITS, ON A PHONE: the decks as a list, a deck as a screen.
//
// The desktop's shelf is a grid of cards — icon, tags, three counts, a month
// of retention as a line, Study, sections, statistics — and on a phone the
// audit found its header alone 180px tall and every card spending a row on an
// empty "No grades yet". Here a deck is a 52px row that says the one thing a
// thumb comes for, how many are due, and opens the deck's own screen
// (./DeckScreen.tsx), where Study starts the session full-screen. The session
// itself is the desktop's, unchanged (./SessionScreen.tsx).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeckMeta } from "../../../shared/decks.ts";
import { isoDate } from "../../../shared/routine.ts";
import { getDecks } from "../../api.ts";
import { countPhrase, t, tf } from "../../i18n.ts";
import { lazySurface } from "../../lazySurface.tsx";
import { st, stf } from "../../orbits/copy.ts";
import { useStore } from "../../state.ts";
import { usePhone } from "../context.ts";
import { IconChevron, IconPlus } from "../icons.tsx";
import RoutedLayer from "../RoutedLayer.tsx";
import TopBar from "../TopBar.tsx";
import { useScrollMemory } from "../useScrollMemory.ts";
import { useVaultTick } from "../useVaultTick.ts";
import "../../styles/orbits.css";

const NewDeckModal = lazySurface(() => import("../../orbits/NewDeckModal.tsx"));

/** Every deck with cards, the implicit "Everything else" last. */
export function shelfOrder(list: DeckMeta[]): DeckMeta[] {
  return [...list.filter((m) => !m.implicit), ...list.filter((m) => m.implicit && m.counts.total > 0)];
}

export function deckTitle(meta: DeckMeta): string {
  return meta.implicit ? t("orbitsEverything") : meta.title;
}

export default function OrbitsScreen({ onBack }: { onBack?: () => void }) {
  const phone = usePhone();
  const admin = useStore((s) => s.admin);
  useStore((s) => s.language);
  const tick = useVaultTick();
  const today = isoDate(new Date());
  const [all, setAll] = useState<DeckMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useScrollMemory(scrollRef);

  const load = useCallback(() => {
    getDecks(today)
      .then((list) => {
        setAll(list);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [today]);
  useEffect(load, [load, tick]);

  const decks = useMemo(() => shelfOrder(all ?? []), [all]);
  const due = decks.reduce((n, m) => n + m.counts.due, 0);

  return (
    <div className="s-ph-screen s-ph-orbits" data-screen="orbits">
      <TopBar
        title={t("orbits")}
        onBack={onBack}
        onTitle={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
        actions={
          admin ? (
            <button type="button" className="s-ph-icon" aria-label={t("orbitsNewDeck")} onClick={() => setAdding(true)}>
              <IconPlus />
            </button>
          ) : undefined
        }
      />
      <div className="s-ph-scroll" ref={scrollRef}>
        <p className="s-ph-today__date">{all === null ? t("loading") : due === 0 ? st("orbitsNothingDue") : stf("orbitsDueToday", { n: countPhrase(due, "orbits") })}</p>
        {failed ? (
          <p className="s-ph-empty">{st("orbitsFailed")}</p>
        ) : all !== null && decks.length === 0 ? (
          <div className="s-ph-empty">
            <p>{st("orbitsEmpty")}</p>
            <p className="s-ph-foot">{st("orbitsEmptyHint")}</p>
          </div>
        ) : (
          <ul className="s-ph-list" aria-label={t("orbits")}>
            {decks.map((meta) => (
              <li key={meta.path}>
                <button type="button" className="s-ph-row" data-deck={meta.path} onClick={() => phone.open({ kind: "deck", path: meta.path })}>
                  <span className="s-ph-task__sigil" aria-hidden="true">{meta.icon ?? (meta.implicit ? "∗" : "✦")}</span>
                  <span className="s-ph-hit__text">
                    <bdi className="s-ph-row__name" dir="auto">{deckTitle(meta)}</bdi>
                    <span className="s-ph-hit__snippet">{tf("phDeckCounts", { n: countPhrase(meta.counts.total, "cards"), fresh: countPhrase(meta.counts.new, "cards") })}</span>
                  </span>
                  {meta.counts.due > 0 && <span className="s-ph-row__count s-ph-row__count--due">{tf("phCardsDue", { n: countPhrase(meta.counts.due, "cards") })}</span>}
                  <span className="s-ph-row__chev" aria-hidden="true">
                    <IconChevron />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {adding && (
        <RoutedLayer id="new-deck" onGone={() => setAdding(false)}>
          <NewDeckModal
            tab="new"
            onClose={() => setAdding(false)}
            onCreated={() => {
              setAdding(false);
              load();
            }}
          />
        </RoutedLayer>
      )}
    </div>
  );
}
