// Every note carrying one tag — the chip row's and the Tags segment's
// destination. The vault search answers it (`tag:x`, shared/searchQuery.ts),
// so what a tag lists here is what the desktop's search lists for it.

import { useEffect, useRef, useState } from "react";
import type { SearchHit } from "../../../shared/types.ts";
import { search } from "../../api.ts";
import { t } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import { usePhone } from "../context.ts";
import { IconFile } from "../icons.tsx";
import TopBar from "../TopBar.tsx";
import { useScrollMemory } from "../useScrollMemory.ts";

export default function TagScreen({ tag, onBack }: { tag: string; onBack: () => void }) {
  const phone = usePhone();
  useStore((s) => s.language);
  const tree = useStore((s) => s.tree);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useScrollMemory(scrollRef);
  useEffect(() => {
    const ctl = new AbortController();
    search(`tag:${tag}`, ctl.signal)
      .then(setHits)
      .catch(() => {
        if (!ctl.signal.aborted) setHits([]);
      });
    return () => ctl.abort();
  }, [tag, tree]);
  return (
    <div className="s-ph-screen" data-screen="tag">
      <TopBar title={`#${tag}`} userTitle onBack={onBack} />
      <div className="s-ph-scroll" ref={scrollRef}>
        {hits === null ? (
          <p className="s-ph-empty">{t("loading")}</p>
        ) : hits.length === 0 ? (
          <p className="s-ph-empty">{t("noMatchesDot")}</p>
        ) : (
          <ul className="s-ph-list">
            {hits.map((hit) => (
              <li key={hit.path}>
                <button type="button" className="s-ph-row" onClick={() => phone.open({ kind: "note", path: hit.path })}>
                  <span className="s-ph-row__glyph" aria-hidden="true">
                    <IconFile />
                  </span>
                  <bdi className="s-ph-row__name" dir="auto">
                    {hit.title}
                  </bdi>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
