// SOURCES — what a piece of writing is built from (docs/writing-desk.md):
// the notes it links to, the library's books it cites, the web clips it
// draws on, and the notes that point back at it. Gathered by the server from
// the links the piece already has (GET /api/desk/piece); nothing is listed
// by hand, so the section is only ever as long as the piece's own reading.
//
// Shown for a piece (`kind: essay`) to the owner alone, like the desk itself.

import { useEffect, useState } from "react";
import type { DeskPieceDetail, DeskSourceRow } from "../../shared/desk.ts";
import { getDeskPiece } from "../api.ts";
import { t } from "../i18n.ts";
import { useStore } from "../state.ts";
import { useVaultTick } from "../vaultTick.ts";
import { PanelSection } from "./PanelStack.tsx";
import "../styles/sources.css";

function Group({ title, rows, onOpen }: { title: string; rows: (DeskSourceRow & { url?: string })[]; onOpen: (path: string) => void }) {
  if (rows.length === 0) return null;
  return (
    <div className="s-sources__group">
      <h4 className="s-sources__head">{title}</h4>
      <ul className="s-sources__list">
        {rows.map((r) => (
          <li key={r.path}>
            <button type="button" className="s-sources__row" onClick={() => onOpen(r.path)} title={r.url ?? r.path}>
              <bdi className="s-sources__title">{r.title}</bdi>
              {r.url !== undefined && <span className="s-sources__url">{r.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SourcesPanel() {
  const admin = useStore((s) => s.admin);
  const preview = useStore((s) => s.previewVisitor);
  const openPath = useStore((s) => s.openPath);
  const openNote = useStore((s) => s.openNote);
  const openBook = useStore((s) => s.openBook);
  useStore((s) => s.language);
  const tick = useVaultTick();
  const [detail, setDetail] = useState<DeskPieceDetail | null>(null);

  useEffect(() => {
    if (!admin || preview || openPath === null) {
      setDetail(null);
      return;
    }
    let live = true;
    getDeskPiece(openPath)
      .then((d) => {
        if (live) setDetail(d);
      })
      .catch(() => {
        if (live) setDetail(null);
      });
    return () => {
      live = false;
    };
  }, [admin, preview, openPath, tick]);

  if (detail === null || detail.piece.path !== openPath) return null;
  const count = detail.linked.length + detail.books.length + detail.clips.length + detail.backlinks.length;
  const open = (path: string): void => {
    if (/\.(pdf|epub)$/i.test(path)) openBook(path);
    else openNote(path);
  };
  return (
    <PanelSection id="sources" className="s-sources" title={t("panelSources")} count={count}>
      {count === 0 ? (
        <p className="s-sources__empty">{t("deskSourcesEmpty")}</p>
      ) : (
        <>
          <Group title={t("deskSourcesLinked")} rows={detail.linked} onOpen={open} />
          <Group title={t("deskSourcesBooks")} rows={detail.books} onOpen={open} />
          <Group title={t("deskSourcesClips")} rows={detail.clips} onOpen={open} />
          <Group title={t("deskSourcesBacklinks")} rows={detail.backlinks} onOpen={open} />
        </>
      )}
    </PanelSection>
  );
}
