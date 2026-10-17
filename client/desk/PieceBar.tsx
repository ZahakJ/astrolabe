// THE PIECE BAR — a slim strip above a piece in the editor: its status (the
// same pill the desk draws), its series, its angle, the words it has grown by
// day, and the outline-to-headings step (docs/writing-desk.md).
//
// Lazy, and mounted only for a note whose frontmatter says `kind: essay`
// (Editor.tsx asks `isPieceSource` of the buffer), so an ordinary note pays
// nothing for it. Everything it writes goes through the desk's own doors:
// the status through ./actions.ts moveTo, the headings through the editor's
// view as one undoable change (the `onOutline` the editor hands in).

import { useEffect, useState } from "react";
import type { DeskPieceDetail } from "../../shared/desk.ts";
import { getDeskPiece } from "../api.ts";
import { countPhrase, localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { useVaultTick } from "../vaultTick.ts";
import { moveTo } from "./actions.ts";
import { StatusPill } from "./StatusPill.tsx";
import "./piecebar.css";

/** Words by day as a line: one series, the accent, a 2px stroke, the last day
 *  marked. Each day is a hover target with its own number. */
function Curve({ points }: { points: { day: string; words: number }[] }) {
  if (points.length < 2) return null;
  const W = 96;
  const H = 22;
  const max = Math.max(1, ...points.map((p) => p.words));
  const x = (i: number): number => 2 + (i * (W - 4)) / (points.length - 1);
  const y = (n: number): number => H - 3 - (n / max) * (H - 6);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.words).toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <svg
      className="s-piecebar__curve"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={tf("deskCurveLabel", { from: localeNum(first.words), to: localeNum(last.words), days: localeNum(points.length) })}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(last.words)} r="2.5" fill="currentColor" />
      {points.map((p, i) => (
        <rect key={p.day} x={x(i) - (W - 4) / (2 * (points.length - 1))} y="0" width={(W - 4) / (points.length - 1)} height={H} fill="transparent">
          <title>{`${p.day}: ${countPhrase(p.words, "words")}`}</title>
        </rect>
      ))}
    </svg>
  );
}

export default function PieceBar({ path, onOutline }: { path: string; onOutline: () => number | null }) {
  const tick = useVaultTick();
  const openNote = useStore((s) => s.openNote);
  const setView = useStore((s) => s.setView);
  useStore((s) => s.language);
  const [detail, setDetail] = useState<DeskPieceDetail | null>(null);
  const [own, setOwn] = useState(0);

  useEffect(() => {
    let live = true;
    getDeskPiece(path)
      .then((d) => {
        if (live) setDetail(d);
      })
      .catch(() => {
        if (live) setDetail(null);
      });
    return () => {
      live = false;
    };
  }, [path, tick, own]);

  if (detail === null) return null;
  const { piece } = detail;
  const series = detail.seriesTitle ?? piece.seriesRef;
  return (
    <div className="s-piecebar" role="region" aria-label={t("deskBarLabel")} data-testid="piece-bar">
      <StatusPill
        piece={piece}
        onMove={(to) =>
          void moveTo(piece, to).then((ok) => {
            if (ok) setOwn((n) => n + 1);
          })
        }
      />
      {series !== null && (
        <button
          type="button"
          className="s-piecebar__series"
          dir="auto"
          disabled={piece.series === null}
          onClick={() => piece.series !== null && openNote(piece.series)}
          title={t("deskOpenSeries")}
        >
          {series}
        </button>
      )}
      <p className={`s-piecebar__angle${piece.angle === "" ? " s-piecebar__angle--none" : ""}`} dir="auto">
        {piece.angle === "" ? t("deskBarNoAngle") : piece.angle}
      </p>
      <Curve points={detail.words} />
      <button
        type="button"
        className="s-piecebar__act"
        onClick={() => {
          const added = onOutline();
          if (added === null) toast(t("deskOutlineNone"));
          else if (added === 0) toast(t("deskOutlineNothing"));
          else toast(tf("deskOutlineAdded", { n: localeNum(added) }));
        }}
      >
        {t("deskOutlineToHeadings")}
      </button>
      <button type="button" className="s-piecebar__act" onClick={() => setView("desk")}>
        {t("deskOpenDesk")}
      </button>
    </div>
  );
}
