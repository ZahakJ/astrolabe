// ONE TRACKER: the desktop's card (media/MediaView.tsx `MediaCard`), alone on
// the glass — the cover, the bar, the count, the − and + that nudge it by one
// step, the work's folder and its last note. A nudge is answered on screen at
// once and written behind it through `POST /api/tracker`, as on the page.
// Edit and delete are the card's own buttons; the note is one of them too.

import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackerMeta } from "../../../shared/types.ts";
import { getTrackers, updateTracker } from "../../api.ts";
import { t, tf } from "../../i18n.ts";
import { MediaForm } from "../../media/MediaForm.tsx";
import { MediaCard } from "../../media/MediaView.tsx";
import { useStore } from "../../state.ts";
import { toast } from "../../toast.ts";
import { openTrackerFolder } from "../../trackerFolder.ts";
import { usePhone } from "../context.ts";
import RoutedLayer from "../RoutedLayer.tsx";
import TopBar from "../TopBar.tsx";
import { useVaultTick } from "../../vaultTick.ts";
import "../../styles/media.css";


export default function TrackerScreen({ path, index, onBack }: { path: string; index: number; onBack: () => void }) {
  const phone = usePhone();
  const locale = useStore((s) => s.blogLocale);
  useStore((s) => s.language);
  const tick = useVaultTick();
  const [meta, setMeta] = useState<TrackerMeta | null | "gone">(null);
  const [editing, setEditing] = useState(false);
  const inFlight = useRef(0);

  const load = useCallback(() => {
    getTrackers()
      .then((list) => {
        if (inFlight.current > 0) return;
        setMeta(list.find((m) => m.path === path && m.index === index) ?? "gone");
      })
      .catch(() => setMeta((m) => m ?? "gone"));
  }, [path, index]);
  useEffect(load, [load, tick]);

  const step = async (current: TrackerMeta, delta: number): Promise<void> => {
    if (current.done === null) return;
    const done = Math.max(0, current.total === null ? current.done + delta : Math.min(current.total, current.done + delta));
    const percent = current.total === null ? current.percent : (done / current.total) * 100;
    setMeta({ ...current, done, percent });
    inFlight.current += 1;
    try {
      await updateTracker(current.path, current.index, null, delta);
    } catch {
      toast(tf("mediaSaveFailed", { title: current.title }), "error");
      setMeta(current);
    } finally {
      inFlight.current -= 1;
    }
  };

  // Deleted (the card's own Delete, or elsewhere): nothing left to show here.
  const shown = useRef(false);
  useEffect(() => {
    if (meta !== null && meta !== "gone") shown.current = true;
    else if (meta === "gone" && shown.current) phone.nav.popScreen();
  }, [meta, phone]);

  const live = meta !== null && meta !== "gone" ? meta : null;
  return (
    <div className="s-ph-screen s-ph-tracker" data-screen="tracker" data-path={path}>
      <TopBar title={live?.title ?? ""} userTitle onBack={onBack} />
      <div className="s-ph-scroll">
        {meta === null && <p className="s-ph-empty">{t("loading")}</p>}
        {meta === "gone" && <p className="s-ph-empty">{t("phTrackerGone")}</p>}
        {live && (
          <div className="s-ph-tracker__card s-media">
            <MediaCard
              meta={live}
              locale={locale}
              onOpen={() => phone.open({ kind: "note", path: live.path }, "push")}
              onFolder={() => openTrackerFolder(live)}
              onOpenPath={(p) => phone.open({ kind: "note", path: p }, "push")}
              onEdit={() => setEditing(true)}
              onStep={(delta) => void step(live, delta * live.step)}
            />
          </div>
        )}
      </div>
      {editing && live && (
        <RoutedLayer id="edit-tracker" onGone={() => setEditing(false)}>
          <MediaForm
            editing={live}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              load();
            }}
          />
        </RoutedLayer>
      )}
    </div>
  );
}
