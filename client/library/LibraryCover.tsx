// A path's cover: the owner's image when there is one, and otherwise a cover
// the site draws for it — the same hashed ground the blog draws for a post
// without a banner, with the title set on it in the reading face, so a shelf
// without a single photograph is still a shelf and not a list. A book gets a
// spine; a course and a series get a wider plate, because a lecture series is
// a screen and a book is a thing you hold.
import type { LibraryKind } from "../../shared/types.ts";
import { bannerSrc, generatedBannerCss } from "../banner.ts";
import { t } from "../i18n.ts";

export function kindLabel(kind: LibraryKind): string {
  return kind === "book" ? t("libraryKindBook") : kind === "course" ? t("libraryKindCourse") : t("libraryKindSeries");
}

export default function LibraryCover({
  title,
  kind,
  cover,
  size = "card",
}: {
  title: string;
  kind: LibraryKind;
  cover?: string;
  size?: "card" | "hero" | "band";
}) {
  const cls = `s-lib-cover s-lib-cover--${kind} s-lib-cover--${size}`;
  if (cover) {
    return (
      <span className={cls}>
        <img className="s-lib-cover__img" src={bannerSrc(cover)} alt="" loading="lazy" />
      </span>
    );
  }
  return (
    <span className={`${cls} s-lib-cover--drawn`} style={{ background: generatedBannerCss(title, "thumb") }}>
      <span className="s-lib-cover__kind">{kindLabel(kind)}</span>
      <span className="s-lib-cover__title" dir="auto">
        {title}
      </span>
    </span>
  );
}
