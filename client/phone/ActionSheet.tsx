// A list of verbs, as a sheet: what a long-press on a tree row, a heading or
// a note's ⋯ opens. The desktop's ContextMenu is a box at the pointer; a
// finger has no pointer, and a box at the finger is a box under the finger.
// 48px rows from the bottom edge, the destructive ones last and red.

import { t } from "../i18n.ts";
import { usePhone } from "./context.ts";
import Sheet from "./Sheet.tsx";

export interface ActionRow {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  /** A secondary line under the label (the state a toggle is in). */
  note?: string;
  /** The label is the reader's own words (a folder's name): it takes its
   *  own direction rather than the chrome's. */
  user?: boolean;
}

import { ACTION_SHEET } from "./sheetIds.ts";

export { ACTION_SHEET };

/** Open the shell's action sheet with these rows. */
export function useActionSheet(): (title: string, rows: ActionRow[]) => void {
  const phone = usePhone();
  return (title, rows) => phone.openSheet(ACTION_SHEET, { title, rows });
}

export default function ActionSheet({ leaving }: { leaving: boolean }) {
  const phone = usePhone();
  const data = phone.sheetData(ACTION_SHEET) as { title?: string; rows?: ActionRow[] } | undefined;
  const rows = data?.rows ?? [];
  const title = data?.title ?? "";
  return (
    <Sheet
      label={title}
      leaving={leaving}
      onDismiss={() => phone.closeSheet(ACTION_SHEET)}
      header={title ? <h2 className="s-ph-sheet__title" dir="auto">{title}</h2> : undefined}
    >
      <ul className="s-ph-actions" role="menu">
        {rows.map((row, i) => (
          <li key={i} role="none">
            <button
              type="button"
              role="menuitem"
              className={`s-ph-actions__row${row.danger ? " s-ph-actions__row--danger" : ""}`}
              onClick={() => {
                // The sheet steps out of history FIRST; whatever the row does
                // next (another sheet, a navigation) queues behind that pop in
                // the nav, so it lands on the screen and not on this entry.
                phone.closeSheet(ACTION_SHEET);
                row.onSelect();
              }}
            >
              <span className="s-ph-actions__label">{row.user ? <bdi dir="auto">{row.label}</bdi> : row.label}</span>
              {row.note && <span className="s-ph-actions__note">{row.note}</span>}
            </button>
          </li>
        ))}
        <li role="none">
          <button type="button" role="menuitem" className="s-ph-actions__row s-ph-actions__row--cancel" onClick={() => phone.closeSheet(ACTION_SHEET)}>
            <span className="s-ph-actions__label">{t("cancel")}</span>
          </button>
        </li>
      </ul>
    </Sheet>
  );
}
