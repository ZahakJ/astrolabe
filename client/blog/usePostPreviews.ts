// Shared visitor-scoped previews for stock and designed publishing shells.
import { useEffect, useMemo, useRef } from "react";
import type { PostMeta } from "../../shared/types.ts";
import { stripBidiControls } from "../../shared/bidi.ts";
import { isTexPath, noteTitleOf } from "../../shared/noteFormat.ts";
import { getNote } from "../api.ts";
import { bannerSrc } from "../banner.ts";
import { installHoverCards } from "../hovercard.ts";
import { countPhrase } from "../i18n.ts";
import { label as tagLabel } from "../tagLabels.ts";
import { renderNoteContent } from "../reading/renderNote.ts";
import { texPreviewSource } from "../reading/texRender.ts";
import { useStore } from "../state.ts";
import { previewExcerpt, previewPath } from "./postPreview.ts";
import { formatDate } from "./util.tsx";

function noteTitle(path: string): string {
  return stripBidiControls(noteTitleOf(path));
}

export function usePostPreviews(
  root: HTMLElement | null,
  posts: PostMeta[] | null,
  locked: boolean,
  language: string,
  locale = "en",
): void {
  const postTags = useRef(new Map<string, string[]>());
  postTags.current = useMemo(
    () => new Map((posts ?? []).map((p) => [p.path, p.tags])),
    [posts],
  );
  const byPath = useRef(new Map<string, PostMeta>());
  byPath.current = useMemo(() => new Map((posts ?? []).map((p) => [p.path, p])), [posts]);
  useEffect(() => {
    if (!root || locked) return;
    return installHoverCards({
      root,
      scroller: root,
      // A public shell shows the SPOTLIGHT: centred, veiled, wearing the
      // post's own banner and meta. The words under the title are the ones
      // the card beside it already prints, formatted by the same helpers, so
      // the card and the list never disagree about a date or a label.
      presentation: "spotlight",
      meta: (path) => {
        const post = byPath.current.get(path);
        if (!post) return null;
        return {
          when: formatDate(post.date, locale),
          readTime: countPhrase(post.readingMinutes, "readMinutes"),
          tags: post.tags.slice(0, 4).map((tag) => tagLabel(tag)),
          banner: post.banner ? bannerSrc(post.banner) : null,
        };
      },
      resolve: previewPath,
      title: noteTitle,
      render: async (path) => {
        let content: string;
        try {
          // The ordinary visitor-scoped fetch: a note this session may not
          // read 401/404s here, and no card is ever built for it.
          content = (await getNote(path)).content;
        } catch {
          return null;
        }
        const md = isTexPath(path)
          ? texPreviewSource(content, null)
          : previewExcerpt(content, noteTitle(path));
        if (!md) return null;
        const tags = postTags.current.get(path);
        return renderNoteContent(md, {
          notePath: path,
          tree: useStore.getState().tree,
          embedded: true,
          // Same reading-renderer settings the article page uses: no
          // broken-link furniture, no ⌀ chips, and only the post's
          // server-filtered tags may render as pills.
          brokenLinks: "plain",
          missingImages: "card",
          ...(tags ? { visibleTags: new Set(tags.map((x) => x.toLowerCase())) } : {}),
        });
      },
    });
  }, [root, locked, language, locale]);

}
