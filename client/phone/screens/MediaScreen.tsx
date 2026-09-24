// MEDIA, ON A PHONE: every tracker as a row on its shelf, and a tracker as a
// screen (./TrackerScreen.tsx) that is the desktop's card alone on the glass.
//
// The desktop's page is a grid of up to five covers across per shelf; on a
// 412px screen that is one column of tall cards and a long way to the second
// shelf. Here a shelf is a heading and its works are 52px rows — the cover
// (or the kind's glyph), the title, where it stands, the percentage — with
// the status filter as one chip row above them, the way Notes carries its
// tags.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TrackerStatus } from "../../../shared/tracker.ts";
import type { TrackerMeta } from "../../../shared/types.ts";
import { getTrackers } from "../../api.ts";
import FolderGlyph from "../../components/FolderGlyph.tsx";
import { fileUrl } from "../../editor/embeds.ts";
import { localeNum, t, tf } from "../../i18n.ts";
import { MediaForm } from "../../media/MediaForm.tsx";
import { SHELF_ICON, SHELF_LABEL, STATUS_LABEL } from "../../media/MediaView.tsx";
import { STATUS_FILTERS, shelve } from "../../media/mediaModel.ts";
import { useStore } from "../../state.ts";
import { usePhone } from "../context.ts";
import { IconChevron, IconPlus } from "../icons.tsx";
import RoutedLayer from "../RoutedLayer.tsx";
import TopBar from "../TopBar.tsx";
import { useScrollMemory } from "../useScrollMemory.ts";
import { useVaultTick } from "../../vaultTick.ts";
import "../../styles/media.css";


/** A 40px cover, or the kind's glyph where there is none (or it will not load). */
export function Cover({ meta }: { meta: TrackerMeta }) {
  const [broken, setBroken] = useState(false);
  if (meta.cover && !broken) {
    return <img className="s-ph-cover" src={/^https:\/\//i.test(meta.cover) ? meta.cover : fileUrl(meta.cover)} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />;
  }
  return (
    <span className="s-ph-cover s-ph-cover--glyph" aria-hidden="true">
      <FolderGlyph icon={meta.icon} size={20} />
    </span>
  );
}

export default function MediaScreen({ onBack }: { onBack?: () => void }) {
  const phone = usePhone();
  const admin = useStore((s) => s.admin);
  useStore((s) => s.language);
  const tick = useVaultTick();
  const [all, setAll] = useState<TrackerMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<TrackerStatus | null>(null);
  const [adding, setAdding] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useScrollMemory(scrollRef);

  const load = useCallback(() => {
    getTrackers()
      .then((list) => {
        setAll(list);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load, tick]);

  const shelves = useMemo(() => shelve(all ?? [], status), [all, status]);
  const total = all?.length ?? 0;

  return (
    <div className="s-ph-screen s-ph-media" data-screen="media">
      <TopBar
        title={t("media")}
        onBack={onBack}
        onTitle={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
        actions={
          admin ? (
            <button type="button" className="s-ph-icon" aria-label={t("mediaAdd")} onClick={() => setAdding(true)}>
              <IconPlus />
            </button>
          ) : undefined
        }
      />
      <div className="s-ph-scroll" ref={scrollRef}>
        {total > 0 && (
          <div className="s-ph-chips" role="radiogroup" aria-label={t("mediaFilterAria")}>
            {[null, ...STATUS_FILTERS].map((value) => (
              <button
                key={value ?? "all"}
                type="button"
                role="radio"
                aria-checked={value === status}
                className={`s-ph-chip${value === status ? " s-ph-chip--on" : ""}`}
                onClick={() => setStatus(value)}
              >
                {value === null ? t("mediaFilterAll") : t(STATUS_LABEL[value])}
              </button>
            ))}
          </div>
        )}
        {failed ? (
          <p className="s-ph-empty">{t("mediaFailed")}</p>
        ) : all !== null && total === 0 ? (
          <div className="s-ph-empty">
            <p>{t("mediaEmpty")}</p>
            <p className="s-ph-foot">{t("mediaEmptyHint")}</p>
          </div>
        ) : (
          shelves.map(({ shelf, items }) => (
            <section key={shelf} aria-label={t(SHELF_LABEL[shelf])}>
              <h2 className="s-ph-head">
                <span className="s-ph-head__glyph">
                  <FolderGlyph icon={SHELF_ICON[shelf]} size={14} />
                  {t(SHELF_LABEL[shelf])}
                </span>
                <span className="s-ph-head__count">{localeNum(items.length)}</span>
              </h2>
              <ul className="s-ph-list">
                {items.map((meta) => (
                  <li key={`${meta.path}#${meta.index}`}>
                    <button type="button" className="s-ph-row" data-tracker={meta.path} onClick={() => phone.open({ kind: "tracker", path: meta.path, index: meta.index })}>
                      <Cover meta={meta} />
                      <span className="s-ph-hit__text">
                        <bdi className="s-ph-row__name" dir="auto">{meta.title}</bdi>
                        <span className="s-ph-hit__snippet">{t(STATUS_LABEL[meta.status])}</span>
                      </span>
                      {meta.percent !== null && (
                        <span className="s-ph-row__count">{tf("trackerPercent", { percent: localeNum(Math.round(Math.max(0, Math.min(100, meta.percent)))) })}</span>
                      )}
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
      </div>
      {adding && (
        <RoutedLayer id="new-tracker" onGone={() => setAdding(false)}>
          <MediaForm
            editing={null}
            onClose={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              load();
            }}
          />
        </RoutedLayer>
      )}
    </div>
  );
}
