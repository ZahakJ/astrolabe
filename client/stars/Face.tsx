// A face of a star — its front, back or extra — as prose. Markdown through
// the reading renderer, so a cloze front with **[…]**, a quote with its
// **source**, an `![[embed]]` an Anki import brought in, or a wikilink all
// read the way they read in the note. `dir="auto"` because a Japanese card
// and an Arabic one sit in the same session.

import { useEffect, useRef } from "react";
import { renderMarkdown } from "../reading/render.ts";
import { useStore } from "../state.ts";

export default function Face({ md, path, className }: { md: string; path: string; className: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.replaceChildren(renderMarkdown(md, { notePath: path, tree: useStore.getState().tree }));
    return () => el.replaceChildren();
  }, [md, path]);
  return <div ref={host} className={className} dir="auto" />;
}
