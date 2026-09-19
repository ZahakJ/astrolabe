// The palette's table rows, and the one wire between them and the editor.
//
// The palette is in the admin's first paint and the table editor is in the
// editor chunk; a `import { runTableCommand } from "./editor/tables.ts"` at
// the top of CommandPalette.tsx would drag CodeMirror and the reading
// renderer into it. So the palette says WHAT, on a window event, and the
// mounted editor — which is the only thing that knows where the caret is, and
// which of two panes the reader meant — answers. The shape "Find in note",
// "Copy link to this block" and "Insert template…" already take.

import { toast } from "./toast.ts";
import { t } from "./i18n.ts";

/** The rows the palette carries. The rest of the table vocabulary lives on
 *  the widget's own menu, where the target is the cell under the finger. */
export type PaletteTableCmd = "rowAbove" | "rowBelow" | "colBefore" | "colAfter" | "editSource";

export const TABLE_COMMAND_EVENT = "astrolabe:table-command";
export const INSERT_TABLE_EVENT = "astrolabe:insert-table";

export interface TableCommandDetail {
  cmd: PaletteTableCmd;
  /** Set to true by the editor that ran it, so a palette row with no table
   *  under the caret says so instead of doing nothing visible. */
  handled: { value: boolean };
}

export interface InsertTableDetail {
  rows: number;
  cols: number;
}

/** Run one table row. The rAF is the palette's own shape: the overlay has to
 *  be gone and focus back in the editor before a command that moves the caret
 *  runs, or the caret lands somewhere nobody is looking. */
export function tableCommand(cmd: PaletteTableCmd): void {
  requestAnimationFrame(() => {
    const handled = { value: false };
    window.dispatchEvent(
      new CustomEvent<TableCommandDetail>(TABLE_COMMAND_EVENT, { detail: { cmd, handled } }),
    );
    if (!handled.value) toast(t("tableNotHere"));
  });
}

/** "Insert table…" — the grid is asked first, and a reader who leaves it
 *  without choosing gets no table, not a default one. */
export async function insertTableCommand(): Promise<void> {
  const { pickTableSize } = await import("./components/TablePicker.tsx");
  const size = await pickTableSize();
  if (!size) return;
  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent<InsertTableDetail>(INSERT_TABLE_EVENT, { detail: size }));
  });
}
