// THE WRITING DESK ON THE DESKTOP — a pane surface (`~desk`, `/desk`): every
// piece the owner means to write, as a board by status, a list, or the series
// as lanes (docs/writing-desk.md). The content is ./DeskBoard.tsx, which the
// phone's screen mounts too; this file is the page's frame.

import { useCallback } from "react";
import { countPhrase, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import DeskContent from "./DeskBoard.tsx";
import { openNewPiece } from "./door.ts";
import { useDesk } from "./hooks.ts";

export default function DeskView() {
  const admin = useStore((s) => s.admin);
  const openNote = useStore((s) => s.openNote);
  useStore((s) => s.language);
  const state = useDesk("board");
  const onOpen = useCallback((path: string) => openNote(path), [openNote]);
  if (!admin) return <div className="s-desk" />;
  const pieces = state.data?.pieces.length ?? 0;
  const series = state.data?.series.length ?? 0;
  return (
    <div className="s-desk" data-testid="desk">
      <header className="s-desk__head">
        <div className="s-desk__titles">
          <h1 className="s-desk__h1">{t("desk")}</h1>
          {state.data !== null && (pieces > 0 || series > 0) && (
            <p className="s-desk__count">{tf("deskCounts", { pieces: countPhrase(pieces, "pieces"), series: countPhrase(series, "seriesCount") })}</p>
          )}
        </div>
        <div className="s-desk__acts">
          <button type="button" className="s-btn" onClick={() => openNewPiece("series")}>
            {t("deskNewSeries")}
          </button>
          <button type="button" className="s-btn s-btn--accent" onClick={() => openNewPiece("essay")} data-testid="desk-new-essay">
            {t("deskNewEssay")}
          </button>
        </div>
      </header>
      <div className="s-desk__body">
        <DeskContent state={state} onOpen={onOpen} />
      </div>
    </div>
  );
}
