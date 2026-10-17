// The new-piece form's door: a dynamic import and nothing else, so the
// palette, the sidebar and the capture sheet — all early surfaces — carry no
// byte of the form until the owner asks for it (the export dialog's shape).

import type { DeskKind } from "../../shared/desk.ts";

export interface NewPiecePreset {
  /** The series the piece starts in (a series note's path). */
  series?: string;
}

export function openNewPiece(kind: DeskKind = "essay", preset: NewPiecePreset = {}): void {
  void import("./NewPieceForm.tsx")
    .then((mod) => mod.mountNewPieceForm(kind, preset))
    .catch((err: unknown) => {
      console.error("astrolabe: loading the new-piece form failed", err);
    });
}
