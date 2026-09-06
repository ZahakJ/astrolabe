// The parent above a child, and the children below a parent.
//
// A Media tracker may name a `folder:` of the vault — the folder the owner's
// own notes on that book or show already live in. This section is the other
// half of that link: on a note INSIDE such a folder it names the work, shows
// its bar, nudges it, and opens the tracker note; on the tracker note itself
// it turns around and lists the notes under the folder. One section, two
// directions, so moving between a work and its notes is a click either way
// and nothing has to be typed into any note.
//
// Admin only, like the Media page: the trackers route is the owner's shelf.
import { useMemo, useState } from "react";
import type { TrackerMeta, TreeNode } from "../../shared/types.ts";
import { updateTracker } from "../api.ts";
import { loadShelf, useTrackerShelf } from "../trackerShelf.ts";
import { autoDir, countPhrase, localeNum, t, tf } from "../i18n.ts";
import { KIND_UNIT, unitKey } from "../trackerUnits.ts";
import { foldKind } from "../../shared/tracker.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import FolderGlyph from "./FolderGlyph.tsx";

const COLLAPSED_KEY = "astrolabe.trackerpanel-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

/** The notes under `folder`, from the tree the sidebar already holds. */
function notesUnder(tree: TreeNode | null, folder: string): TreeNode[] {
  const out: TreeNode[] = [];
  const prefix = `${folder}/`;
  const walk = (node: TreeNode): void => {
    if (node.type === "folder") {
      for (const child of node.children ?? []) walk(child);
    } else if (node.path.startsWith(prefix)) {
      out.push(node);
    }
  };
  if (tree) walk(tree);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function countText(meta: TrackerMeta): string | null {
  if (meta.done === null) return null;
  const known = unitKey(meta.unit);
  const kind = foldKind(meta.kind);
  const phrase = (n: number): string =>
    known !== null ? countPhrase(n, known) : meta.unit !== null ? `${localeNum(n)} ${meta.unit}` : kind ? countPhrase(n, KIND_UNIT[kind]) : localeNum(n);
  return meta.total === null ? phrase(meta.done) : `${localeNum(meta.done)} / ${phrase(meta.total)}`;
}

export default function TrackerPanel() {
  const admin = useStore((s) => s.admin);
  const preview = useStore((s) => s.previewVisitor);
  const openPath = useStore((s) => s.openPath);
  const tree = useStore((s) => s.tree);
  const openNote = useStore((s) => s.openNote);
  const setView = useStore((s) => s.setView);
  useStore((s) => s.language);
  const list = useTrackerShelf();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  // The longest folder that holds the open note wins, so a work whose folder
  // is inside another work's folder claims its own notes.
  const parent = useMemo(() => {
    if (!openPath || !list) return null;
    let best: TrackerMeta | null = null;
    for (const m of list) {
      if (m.folder === null || m.path === openPath) continue;
      if (!openPath.startsWith(`${m.folder}/`)) continue;
      if (best === null || m.folder.length > (best.folder ?? "").length) best = m;
    }
    return best;
  }, [openPath, list]);
  const own = useMemo(() => (openPath && list ? (list.find((m) => m.path === openPath && m.folder !== null) ?? null) : null), [openPath, list]);
  const children = useMemo(() => (own?.folder ? notesUnder(tree, own.folder) : []), [own, tree]);

  if (!admin || preview || !openPath || (!parent && !own)) return null;

  const toggle = (): void => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      // the preference lasts the session
    }
  };
  const go = (path: string): void => {
    openNote(path);
    setView("editor");
  };
  const nudge = async (meta: TrackerMeta, delta: number): Promise<void> => {
    try {
      await updateTracker(meta.path, meta.index, null, delta);
      await loadShelf(true);
    } catch {
      toast(t("trackerStepFailed"), "error");
    }
  };

  const title = parent ? t("panelTrackedIn") : t("panelWorkNotes");
  const count = parent ? null : children.length;
  return (
    <section className="s-trackerpanel">
      <header className="s-panel-header s-trackerpanel__header">
        <button type="button" className="s-trackerpanel__toggle" onClick={toggle} aria-expanded={!collapsed} title={t(collapsed ? "showTrackerPanel" : "hideTrackerPanel")}>
          <span className={`s-tree__chevron${collapsed ? "" : " s-tree__chevron--open"}`} aria-hidden="true">
            ›
          </span>
          <span className="s-panel-title">{title}</span>
          {count !== null && <span className="s-panel-count">{localeNum(count)}</span>}
        </button>
      </header>
      {!collapsed && parent && (
        <div className="s-trackerpanel__work" dir={autoDir(parent.title)}>
          <button type="button" className="s-trackerpanel__open" onClick={() => go(parent.path)} title={t("panelOpenTracker")}>
            <span className="s-trackerpanel__glyph">
              <FolderGlyph icon={parent.icon} size={16} />
            </span>
            <span className="s-trackerpanel__title" dir="auto">
              {parent.title}
            </span>
          </button>
          {parent.percent !== null && (
            <div className="s-trackerpanel__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(parent.percent)} aria-label={t("trackerProgress")}>
              <span className="s-trackerpanel__fill" style={{ inlineSize: `${Math.max(0, Math.min(100, parent.percent))}%` }} />
            </div>
          )}
          <div className="s-trackerpanel__row">
            <span className="s-trackerpanel__count" dir="auto">
              {countText(parent) ?? ""}
            </span>
            <span className="s-trackerpanel__steps">
              <button type="button" className="s-trackerpanel__step" onClick={() => void nudge(parent, -parent.step)} aria-label={t("trackerStepDown")} title={t("trackerStepDown")} disabled={parent.done === null}>
                −
              </button>
              <button type="button" className="s-trackerpanel__step" onClick={() => void nudge(parent, parent.step)} aria-label={t("trackerStepUp")} title={t("trackerStepUp")} disabled={parent.done === null}>
                +
              </button>
            </span>
          </div>
        </div>
      )}
      {!collapsed && !parent && own && (
        <ul className="s-trackerpanel__notes">
          {children.length === 0 && <li className="s-trackerpanel__empty">{t("panelWorkNoNotes")}</li>}
          {children.map((n) => (
            <li key={n.path}>
              <button type="button" className="s-trackerpanel__note" onClick={() => go(n.path)} title={n.path}>
                <bdi>{n.name.replace(/\.(md|tex|latex)$/i, "")}</bdi>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
