// ONE glyph from the closed folder set (shared/folderIcons.ts), drawn.
//
// Deliberately the smallest component in the tree: it imports the enum's
// validator and, LAZILY, the path table — nothing else. Both the sidebar
// (admin bundle) and the blog chunk render folder glyphs, and a component
// that dragged the store, the i18n dictionary or a stylesheet behind it would
// drag all three into the anonymous reader's download.
//
// WHY THE DRAWINGS ARE LAZY. Three hundred glyphs are eighty kilobytes of
// path data. A blog page that renders two folder marks must not download
// them in its first paint, so the table arrives in its own chunk on the first
// render that needs one and is shared by every glyph after (and by the
// picker, which imports the same module). Until it lands the glyph draws
// NOTHING — the row it decorates keeps its name, so nothing is lost, and the
// mark appears a few milliseconds later, once, per session.
//
// It is DECORATION. Every folder glyph in this app sits beside a name that is
// always present — the tree row's label, the folder card's title — so the svg
// is `aria-hidden` and carries no fact of its own (map-vault §5).

import { useSyncExternalStore } from "react";
import { isFolderIcon, isFolderImage } from "../../shared/folderIcons.ts";

type PathTable = Record<string, readonly string[]>;

let table: PathTable | null = null;
let loading: Promise<PathTable | null> | null = null;
const listeners = new Set<() => void>();

/** The drawings, fetched once. Resolves null when the chunk cannot be loaded
 *  (offline after a deploy) — the glyphs simply stay absent. */
export function loadFolderIconPaths(): Promise<PathTable | null> {
  if (table) return Promise.resolve(table);
  loading ??= import("../../shared/folderIconPaths.ts")
    .then((m) => {
      table = m.FOLDER_ICON_PATHS;
      for (const fn of listeners) fn();
      return table;
    })
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (!table) void loadFolderIconPaths();
  return () => {
    listeners.delete(fn);
  };
}

const snapshot = (): PathTable | null => table;

/** The path table, or null until it has loaded; re-renders the caller when
 *  it lands. */
export function useFolderIconPaths(): PathTable | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export default function FolderGlyph({ icon, size = 14 }: { icon: string; size?: number }) {
  const paths = useFolderIconPaths();
  // An image of the owner's own: served by /api/file, which answers a
  // visitor for it on the covers' terms. Still decoration, still aria-hidden;
  // a broken file draws nothing rather than the browser's broken-image box.
  if (isFolderImage(icon)) {
    return (
      <img
        className="s-folder-mark s-folder-mark--img"
        src={`/api/file?path=${encodeURIComponent(icon)}`}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        loading="lazy"
        onError={(e) => ((e.target as HTMLImageElement).hidden = true)}
      />
    );
  }
  // An unknown icon draws NOTHING, never a placeholder box — the rule
  // PanelGlyphs.tsx:92-100 set for the design rail. A settings.json edited by
  // hand, or a build older than the glyph it is being asked for, leaves the
  // row exactly as it was rather than putting a mystery mark on it.
  if (!isFolderIcon(icon) || !paths) return null;
  const ds = paths[icon];
  if (!ds) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ds.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
