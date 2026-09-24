// A LIST TO PICK FROM, as a sheet — a book's contents, today. Rows with a
// depth (indented by it), something at their end (a page number) and one of
// them lit (the chapter being read, scrolled into view when the sheet
// opens). A pick closes the sheet FIRST and then runs, so the jump lands on
// the reader and not on the sheet's history entry — the action sheet's rule.
// Opens at half height; a drag up takes it to the full list.

import { useLayoutEffect, useRef } from "react";
import type { OutlineRow } from "../books/chrome.tsx";
import { usePhone } from "./context.ts";
import { LIST_SHEET } from "./sheetIds.ts";
import Sheet from "./Sheet.tsx";

export default function ListSheet({ leaving }: { leaving: boolean }) {
  const phone = usePhone();
  const data = phone.sheetData(LIST_SHEET) as { title?: string; rows?: OutlineRow[]; pick?: (index: number) => void } | undefined;
  const rows = data?.rows ?? [];
  const title = data?.title ?? "";
  const lit = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    lit.current?.scrollIntoView({ block: "center" });
  }, []);
  return (
    <Sheet
      label={title}
      detent="half"
      side={phone.tablet}
      leaving={leaving}
      onDismiss={() => phone.closeSheet(LIST_SHEET)}
      header={title ? <h2 className="s-ph-sheet__title" dir="auto">{title}</h2> : undefined}
    >
      <ol className="s-ph-actions s-ph-listsheet" aria-label={title}>
        {rows.map((row, i) => (
          <li key={`${row.label}-${i}`}>
            <button
              type="button"
              ref={row.current ? lit : undefined}
              className={`s-ph-actions__row s-ph-listsheet__row${row.current ? " s-ph-listsheet__row--lit" : ""}`}
              style={{ paddingInlineStart: `${20 + Math.min(row.depth, 4) * 16}px` }}
              aria-current={row.current ? "true" : undefined}
              onClick={() => {
                phone.closeSheet(LIST_SHEET);
                data?.pick?.(i);
              }}
            >
              <bdi className="s-ph-actions__label" dir="auto">
                {row.label}
              </bdi>
              {row.trailing ? <span className="s-ph-actions__note">{row.trailing}</span> : null}
            </button>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
