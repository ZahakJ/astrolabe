// The export dialog's door: a dynamic import and nothing else, so the
// palette and the tree's folder menu — both first-paint surfaces — carry no
// byte of the dialog, its stylesheet or the HTML serialiser until an admin
// asks. The same shape as client/whatsnew/door.ts, for the same budget.

import type { ExportScope } from "../../shared/types.ts";

export interface ExportPreset {
  /** Which row of the scope control opens selected. Default: this note when
   *  one is open, else the whole vault. */
  scope?: ExportScope;
  /** The folder the "A folder" scope starts on — the tree's right-click
   *  hands the folder it was opened on. Default: the open note's folder. */
  folder?: string;
}

export function openExportDialog(preset: ExportPreset = {}): void {
  void import("./ExportDialog.tsx")
    .then((mod) => mod.mountExportDialog(preset))
    .catch((err: unknown) => {
      console.error("astrolabe: loading the export dialog failed", err);
    });
}
