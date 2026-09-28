// The note screen's tabs (./noteTabs.ts): a strip under its bar, on the
// glass wide enough to keep more than one note open (client/shellQuery.ts
// NOTE_TABS_QUERY). One chip per open note, the one on screen marked; a tap
// switches to it in place (`swap`: Back still goes to the list, not through
// every note read); × closes one and shows its neighbour. Drawn only while
// there are two — one open note needs no strip. It scrolls sideways, in the
// chrome's direction, and slides away with the bar while reading down.

import { useEffect, useRef, useSyncExternalStore } from "react";
import { noteLabelOf } from "../../shared/noteFormat.ts";
import { t } from "../i18n.ts";
import { useStore } from "../state.ts";
import { findNode } from "../treeOrder.ts";
import { usePhone } from "./context.ts";
import { IconClose } from "./icons.tsx";
import { closeNoteTab, noteTabs, pruneNoteTabs, subscribeNoteTabs } from "./noteTabs.ts";

const labelOf = (path: string): string => noteLabelOf(path.slice(path.lastIndexOf("/") + 1));

export default function NoteTabStrip({ path, hidden, onLast }: { path: string; hidden: boolean; onLast: () => void }) {
  const phone = usePhone();
  const tabs = useSyncExternalStore(subscribeNoteTabs, noteTabs, noteTabs);
  const tree = useStore((s) => s.tree);
  const ref = useRef<HTMLElement | null>(null);

  // A note deleted since it was opened (here or elsewhere) leaves the strip.
  useEffect(() => {
    if (tree !== null) pruneNoteTabs((p) => findNode(tree, p) !== null);
  }, [tree]);

  // The note on screen is in view in the strip.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [path, tabs]);

  if (tabs.length < 2) return null;
  const close = (p: string): void => {
    const next = closeNoteTab(p);
    if (p !== path) return;
    if (next !== null) phone.open({ kind: "note", path: next }, "swap");
    else onLast();
  };
  return (
    <nav ref={ref} className={`s-ph-ntabs${hidden ? " s-ph-ntabs--hidden" : ""}`} aria-label={t("phNoteTabs")} data-note-tabs={tabs.length}>
      {tabs.map((p) => {
        const on = p === path;
        const name = labelOf(p);
        return (
          <div key={p} className={`s-ph-ntab${on ? " s-ph-ntab--on" : ""}`} data-path={p}>
            <button
              type="button"
              className="s-ph-ntab__open"
              aria-current={on ? "page" : undefined}
              onClick={() => {
                if (!on) phone.open({ kind: "note", path: p }, "swap");
              }}
            >
              <bdi dir="auto">{name}</bdi>
            </button>
            <button type="button" className="s-ph-ntab__close" aria-label={t("phCloseTab").replace("{name}", name)} data-action="close-tab" onClick={() => close(p)}>
              <IconClose />
            </button>
          </div>
        );
      })}
    </nav>
  );
}
