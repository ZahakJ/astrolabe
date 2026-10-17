// THE WRITING DESK ON A PHONE — under More (docs/writing-desk.md). The
// content is the desktop's own (client/desk/DeskBoard.tsx), drawn stacked: a
// board's columns one under the other, because a 412px screen has no room for
// seven side by side, and every card moved by its status pill rather than by
// a drag a thumb would spend on scrolling. New essay idea is the top bar's +.

import { useCallback } from "react";
import { t } from "../../i18n.ts";
import DeskContent from "../../desk/DeskBoard.tsx";
import { openNewPiece } from "../../desk/door.ts";
import { useDesk } from "../../desk/hooks.ts";
import { usePhone } from "../context.ts";
import { IconPlus } from "../icons.tsx";
import TopBar from "../TopBar.tsx";

export default function DeskScreen({ onBack }: { onBack?: () => void }) {
  const phone = usePhone();
  const state = useDesk("list");
  const onOpen = useCallback((path: string) => phone.open({ kind: "note", path }), [phone]);
  return (
    <div className="s-ph-screen s-ph-desk" data-screen="desk">
      <TopBar
        title={t("desk")}
        onBack={onBack}
        actions={
          <button type="button" className="s-ph-icon" aria-label={t("deskNewEssay")} onClick={() => openNewPiece("essay")} data-action="desk-new">
            <IconPlus />
          </button>
        }
      />
      <div className="s-ph-scroll s-ph-desk__body">
        <DeskContent state={state} phone onOpen={onOpen} />
      </div>
    </div>
  );
}
