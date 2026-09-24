// THE NOTE SHEET — what the desktop keeps in its outline pane and its status
// bar, behind the note screen's ⋯.
//
// Four segments: OUTLINE (the outline itself — TocPanel, unchanged — and a
// jump closes the sheet, because the reader asked to GO somewhere), BACKLINKS
// (one card per note, each line a door to the mention), PROPERTIES (the
// frontmatter, editable a row at a time), and ACTIONS (publish — asking
// first — the twin, share, move, history, delete). Opens at half height; a
// drag up takes it to 90%. On a tablet it is a 360px slide-over from the
// trailing edge that never narrows the note.

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Backlink } from "../../shared/types.ts";
import { noteLabelOf } from "../../shared/noteFormat.ts";
import { splitFrontmatter } from "../../shared/noteParse.ts";
import { promptModal } from "../components/Confirm.tsx";
import { confirmDeleteNote } from "../components/deleteFlow.ts";
import { parseProps, type PropRow } from "../editor/noteMeta.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { lazySurface } from "../lazySurface.tsx";
import { notePathToUrl } from "../router.ts";
import { copyNoteLink, noteContent } from "../sectionActions.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { chromeLangSwitch } from "../chromeLangSwitch.ts";
import { createTwinFlow, switchToTwin, twinOf, twinPillLabels } from "../twins.ts";
import { usePhone } from "./context.ts";
import { MOVE_SHEET, NOTE_SHEET, TAG_SHEET } from "./sheetIds.ts";
import { publishWithConfirmation } from "./publish.ts";
import Sheet from "./Sheet.tsx";

const TocPanel = lazySurface(() => import("../reading/TocPanel.tsx"));
const HistoryPanel = lazySurface(() => import("../components/HistoryPanel.tsx"));

/** What an emptied property field resolves to: remove the key. */
const CLEAR = "\u0000";
export type NoteSegment = "outline" | "backlinks" | "properties" | "actions" | "history";

interface Group {
  path: string;
  title: string;
  lines: { text: string; line: number }[];
}

function group(backlinks: Backlink[]): Group[] {
  const by = new Map<string, Group>();
  for (const bl of backlinks) {
    const g = by.get(bl.path);
    if (g) {
      if (!g.lines.some((l) => l.line === bl.line)) g.lines.push({ text: bl.context, line: bl.line });
    } else by.set(bl.path, { path: bl.path, title: bl.title, lines: [{ text: bl.context, line: bl.line }] });
  }
  return [...by.values()];
}

/** Context lines read as prose: the link's label, never its brackets. */
function plain(text: string): string {
  return text
    .replace(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_m, target: string, label?: string) => (label ?? target).trim())
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/^#{1,6}\s+/, "");
}

function Backlinks({ path }: { path: string }) {
  const backlinks = useStore((s) => s.backlinks);
  const groups = useMemo(() => group(backlinks), [backlinks]);
  const land = (to: string, line: number): void => {
    void import("../landing.ts").then((m) => m.landOnLine(to, line));
  };
  if (groups.length === 0) return <p className="s-ph-empty">{t("noBacklinks")}</p>;
  return (
    <ul className="s-ph-list s-ph-backlinks" aria-label={t("backlinks")} data-note={path}>
      {groups.map((g) => (
        <li key={g.path} className="s-ph-backlink">
          <button type="button" className="s-ph-row s-ph-backlink__title" onClick={() => land(g.path, g.lines[0].line)}>
            <bdi className="s-ph-row__name" dir="auto">{g.title}</bdi>
            {g.lines.length > 1 && <span className="s-ph-row__count">{localeNum(g.lines.length)}</span>}
          </button>
          {g.lines.map((l) => (
            <button key={l.line} type="button" className="s-ph-backlink__line" dir="auto" onClick={() => land(g.path, l.line)}>
              {plain(l.text)}
            </button>
          ))}
        </li>
      ))}
    </ul>
  );
}

function Properties({ path }: { path: string }) {
  const phone = usePhone();
  const admin = useStore((s) => s.admin);
  const reload = useStore((s) => s.reloadTick);
  const [rows, setRows] = useState<PropRow[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    noteContent(path)
      .then((content) => live && setRows(parseProps(splitFrontmatter(content).frontmatter)))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [path, reload, tick]);
  // The note's tags are a PICK from the vault's tags, not a line of text to
  // retype: the tag picker (./TagPickerSheet.tsx), over this sheet.
  const tags = (): void => phone.openSheet(TAG_SHEET, { mode: "note", path });
  // Back from the picker: read the note again, the tags may have moved.
  const picking = phone.state.sheets.includes(TAG_SHEET);
  const wasPicking = useRef(false);
  useEffect(() => {
    if (wasPicking.current && !picking) setTick((n) => n + 1);
    wasPicking.current = picking;
  }, [picking]);
  const edit = async (key: string, current: PropRow | null): Promise<void> => {
    if (key.toLowerCase() === "tags") {
      tags();
      return;
    }
    // An emptied field on an existing property removes it, and says so under
    // the field before the reader commits to it.
    const value = await promptModal({
      title: current ? key : t("propAdd"),
      value: current ? current.values.join(", ") : "",
      confirmLabel: t("phSave"),
      check: (raw) =>
        raw.trim() === "" ? (current ? { value: CLEAR, note: t("phPropClear") } : { value: "" }) : { value: raw.trim() },
    });
    if (value === null) return;
    const text = value === CLEAR ? "" : value.trim();
    const store = useStore.getState();
    await store.setProperty(path, key, text === "" ? null : current?.list ? { kind: "list", items: text.split(",").map((s) => s.trim()).filter(Boolean) } : { kind: "text", text });
    setTick((n) => n + 1);
  };
  const add = async (): Promise<void> => {
    const key = await promptModal({ title: t("propAdd"), placeholder: t("phPropKey"), confirmLabel: t("phNext") });
    if (!key) return;
    await edit(key.trim(), null);
  };
  if (rows === null) return <p className="s-ph-empty">{t("loading")}</p>;
  return (
    <>
      {rows.length === 0 && <p className="s-ph-empty">{t("phNoProps")}</p>}
      <ul className="s-ph-list s-ph-props" aria-label={t("properties")}>
        {admin && !rows.some((row) => row.key.toLowerCase() === "tags") && (
          <li>
            <button type="button" className="s-ph-row s-ph-prop" data-prop="tags" onClick={tags}>
              <span className="s-ph-prop__key">{t("tags")}</span>
              <span className="s-ph-prop__value">{t("phTagsAdd")}</span>
            </button>
          </li>
        )}
        {rows.map((row) => (
          <li key={row.key}>
            <button type="button" className="s-ph-row s-ph-prop" data-prop={row.key} disabled={!admin} onClick={() => void edit(row.key, row)}>
              <bdi className="s-ph-prop__key" dir="auto">{row.key}</bdi>
              <bdi className="s-ph-prop__value" dir="auto">{row.values.join(", ")}</bdi>
            </button>
          </li>
        ))}
        {admin && (
          <li>
            <button type="button" className="s-ph-row s-ph-row--add" onClick={() => void add()}>
              <span className="s-ph-row__name">{t("propAdd")}</span>
            </button>
          </li>
        )}
      </ul>
    </>
  );
}

function Actions({ path, onHistory }: { path: string; onHistory: () => void }) {
  const phone = usePhone();
  const admin = useStore((s) => s.admin);
  const pocket = useStore((s) => s.pocket);
  const language = useStore((s) => s.language);
  const published = useStore((s) => s.openPublished ?? s.publishedPaths?.has(path) ?? false);
  const twins = useStore((s) => s.twins);
  const pair = twinOf(path);
  void twins;
  const close = (): void => phone.closeSheet(NOTE_SHEET);
  const share = async (): Promise<void> => {
    const url = `${location.origin}${notePathToUrl(path)}`;
    const title = noteLabelOf(path.slice(path.lastIndexOf("/") + 1));
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }
    } catch {
      return; // the reader closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(url);
      toast(t("phLinkCopied"));
    } catch {
      copyNoteLink(path);
    }
  };
  const rows: { label: string; note?: string; lang?: string; danger?: boolean; run: () => void; id: string }[] = [];
  if (admin && !pocket) {
    rows.push({
      id: "publish",
      label: published ? t("phUnpublish") : t("publish"),
      note: published ? t("published") : t("phPrivate"),
      run: () => void publishWithConfirmation(path, !published),
    });
  }
  if (pair) {
    const labels = twinPillLabels(pair);
    rows.push({ id: "twin", label: tf("phTwinSwap", { there: labels.there }), run: () => switchToTwin(path) });
  } else if (admin) {
    rows.push({ id: "twin-create", label: t("phTwinCreate"), run: () => void createTwinFlow(path) });
  }
  rows.push({ id: "share", label: t("phShare"), run: () => void share() });
  if (admin) {
    // THE WAY BACK, from inside a note (chromeLangSwitch.ts): the
    // sentence in the language a tap goes TO, then the same sentence in the
    // one on screen — whichever of the two the reader can read, the row says
    // what it does.
    const sw = chromeLangSwitch(language);
    rows.push({ id: "chrome-lang", label: sw.own, note: sw.here, lang: sw.target, run: () => useStore.getState().toggleChromeLang() });
  }
  if (admin) {
    rows.push({ id: "move", label: t("moveTo"), run: () => phone.openSheet(MOVE_SHEET, { path, isFolder: false }) });
    rows.push({ id: "history", label: t("history"), run: onHistory });
    rows.push({ id: "delete", label: t("delete"), danger: true, run: () => void confirmDeleteNote(path) });
  }
  return (
    <ul className="s-ph-actions" role="menu">
      {rows.map((row) => (
        <li key={row.id} role="none">
          <button
            type="button"
            role="menuitem"
            data-action={row.id}
            className={`s-ph-actions__row${row.danger ? " s-ph-actions__row--danger" : ""}`}
            onClick={() => {
              if (row.id !== "history") close();
              row.run();
            }}
          >
            <span className="s-ph-actions__label" lang={row.lang} dir={row.lang === undefined ? undefined : row.lang === "ar" ? "rtl" : "ltr"}>{row.label}</span>
            {row.note && <span className="s-ph-actions__note">{row.note}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function NoteSheet({ leaving }: { leaving: boolean }) {
  const phone = usePhone();
  const data = phone.sheetData(NOTE_SHEET) as { path?: string; segment?: NoteSegment } | undefined;
  const openPath = useStore((s) => s.openPath);
  const backlinks = useStore((s) => s.backlinks.length);
  useStore((s) => s.language);
  const path = data?.path ?? openPath;
  const [segment, setSegment] = useState<NoteSegment>(data?.segment ?? "outline");

  // AN OUTLINE JUMP CLOSES THE SHEET: the row asked to GO somewhere, and a
  // sheet left standing over the place it went to is the old outline drawer
  // the audit found still open after every jump.
  useEffect(() => {
    if (segment !== "outline") return;
    const onGoto = (): void => phone.closeSheet(NOTE_SHEET);
    window.addEventListener("astrolabe:goto-heading", onGoto);
    return () => window.removeEventListener("astrolabe:goto-heading", onGoto);
  }, [segment, phone]);

  if (!path) return null;
  const SEGS: { id: NoteSegment; label: string; count?: number }[] = [
    { id: "outline", label: t("outline") },
    { id: "backlinks", label: t("backlinks"), count: backlinks },
    { id: "properties", label: t("properties") },
    { id: "actions", label: t("phActions") },
  ];
  return (
    <Sheet
      label={t("phNoteSheet")}
      detent="half"
      side={phone.tablet}
      leaving={leaving}
      onDismiss={() => phone.closeSheet(NOTE_SHEET)}
      className="s-ph-notesheet"
      header={
        <div className="s-ph-seg s-ph-seg--sheet" role="tablist" aria-label={t("phNoteSheet")}>
          {SEGS.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={segment === s.id} data-segment={s.id} className={`s-ph-seg__btn${segment === s.id || (s.id === "actions" && segment === "history") ? " s-ph-seg__btn--on" : ""}`} onClick={() => setSegment(s.id)}>
              {s.label}
              {s.count ? <span className="s-ph-seg__count">{localeNum(s.count)}</span> : null}
            </button>
          ))}
        </div>
      }
    >
      <div className="s-ph-notesheet__body" role="tabpanel" data-segment={segment}>
        {segment === "outline" && (
          <Suspense fallback={<p className="s-ph-empty">{t("loading")}</p>}>
            <div className="s-ph-toc">
              <TocPanel />
            </div>
          </Suspense>
        )}
        {segment === "backlinks" && <Backlinks path={path} />}
        {segment === "properties" && <Properties path={path} />}
        {segment === "actions" && <Actions path={path} onHistory={() => setSegment("history")} />}
        {segment === "history" && (
          <Suspense fallback={<p className="s-ph-empty">{t("loading")}</p>}>
            <div className="s-ph-history">
              <HistoryPanel />
            </div>
          </Suspense>
        )}
      </div>
    </Sheet>
  );
}
