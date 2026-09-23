// "Move to…", as a sheet: a filter field and every folder the item may land
// in. The desktop's picker (components/MovePicker.tsx) is a centred dialog it
// mounts on <body> itself; this is its phone shape, over the SAME rule
// (`canDrop`) and the SAME move (`moveTo`, which asks for a new name through
// the shell's question sheet when the name is taken, and offers the undo).

import { useMemo, useRef, useState } from "react";
import { t, tf } from "../i18n.ts";
import { allFolders, canDrop, folderLabel, moveTo, parentDir, type MoveItem } from "../move.ts";
import { promptNewFolder } from "../prompts.ts";
import { useStore } from "../state.ts";
import { usePhone } from "./context.ts";
import { IconFolder, IconPlus } from "./icons.tsx";
import Sheet from "./Sheet.tsx";

import { MOVE_SHEET } from "./sheetIds.ts";

export default function MoveSheet({ leaving }: { leaving: boolean }) {
  const phone = usePhone();
  const tree = useStore((s) => s.tree);
  const data = phone.sheetData(MOVE_SHEET) as { path?: string; isFolder?: boolean } | undefined;
  const [filter, setFilter] = useState("");
  const fieldRef = useRef<HTMLInputElement | null>(null);
  const item: MoveItem | null = data?.path ? { path: data.path, name: data.path.slice(data.path.lastIndexOf("/") + 1), isFolder: data.isFolder === true } : null;
  const folders = useMemo(() => {
    if (!item) return [];
    const q = filter.trim().toLowerCase();
    return ["", ...allFolders(tree)].filter((d) => canDrop(item, d) && (q === "" || d.toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, filter, data?.path]);
  if (!item) return null;
  const close = (): void => phone.closeSheet(MOVE_SHEET);
  const go = (dir: string): void => {
    close();
    void moveTo(item, dir);
  };
  return (
    <Sheet
      label={t("moveTo")}
      detent="half"
      leaving={leaving}
      onDismiss={close}
      header={
        <>
          <h2 className="s-ph-sheet__title">{t("moveTo")}</h2>
          <p className="s-ph-sheet__sub" dir="auto">{tf("moveCurrently", { folder: folderLabel(parentDir(item.path)) })}</p>
        </>
      }
    >
      <input
        ref={fieldRef}
        className="s-ph-field s-ph-field--filter"
        type="search"
        dir="auto"
        value={filter}
        placeholder={t("moveFilter")}
        aria-label={t("moveFilter")}
        onChange={(e) => setFilter(e.target.value)}
        enterKeyHint="search"
      />
      <ul className="s-ph-list">
        <li>
          <button
            type="button"
            className="s-ph-row"
            onClick={() => {
              close();
              void promptNewFolder("", filter.trim()).then((made) => {
                if (made !== null) void moveTo(item, made);
              });
            }}
          >
            <span className="s-ph-row__glyph" aria-hidden="true">
              <IconPlus />
            </span>
            <span className="s-ph-row__name">{filter.trim() ? tf("moveNewFolderNamed", { name: filter.trim() }) : t("moveNewFolder")}</span>
          </button>
        </li>
        {folders.map((dir) => (
          <li key={dir || "\u0000root"}>
            <button type="button" className="s-ph-row" onClick={() => go(dir)}>
              <span className="s-ph-row__glyph" aria-hidden="true">
                <IconFolder />
              </span>
              <bdi className="s-ph-row__name" dir="auto">
                {folderLabel(dir)}
              </bdi>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
