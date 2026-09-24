// The door to the Mentions section (docs/webmentions.md), mounted under the
// comments by BlogArticle and ReadingView. It is the only part of the
// feature on an article's first paint: it asks what other sites said, and
// only when there is something does it load the section itself (Mentions.tsx
// and its stylesheet, a chunk of their own) — an article nobody mentioned,
// which is nearly every article, pays one small request and nothing else.

import { lazy, Suspense, useEffect, useState } from "react";
import type { CommentData } from "../../shared/types.ts";
import { useStore } from "../state.ts";
import { fetchMentions } from "./mentionsApi.ts";

// A section that cannot load is a section that is not there: it is a
// footnote to the article, never a reason to show an error in it.
const Mentions = lazy(() => import("./Mentions.tsx").catch(() => ({ default: () => null })));

export default function MentionsSection({ path }: { path: string }) {
  const admin = useStore((s) => s.admin);
  const openPublished = useStore((s) => s.openPublished);
  const inPublishedSet = useStore((s) => s.publishedPaths?.has(path) ?? false);
  const [items, setItems] = useState<CommentData[]>([]);

  // A visitor only ever reads published pages; the owner's own view asks
  // only where the note is published, like the comments beside it.
  const askable = !admin || openPublished === true || inPublishedSet;

  useEffect(() => {
    if (!askable) {
      setItems([]);
      return;
    }
    let disposed = false;
    fetchMentions(path)
      .then((list) => {
        if (!disposed) setItems(list.filter((m) => m.hidden !== true));
      })
      .catch(() => {
        if (!disposed) setItems([]);
      });
    return () => {
      disposed = true;
    };
  }, [path, askable]);

  if (items.length === 0) return null;
  return (
    <Suspense fallback={null}>
      <Mentions items={items} />
    </Suspense>
  );
}
