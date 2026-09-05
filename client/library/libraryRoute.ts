// The library's routes and page titles — the small, static half of
// client/library/LibraryPages.tsx, imported by both shells' route parsers so
// the pages themselves can stay in a lazy chunk.
import type { LibraryPath } from "../../shared/types.ts";
import { t } from "../i18n.ts";
import { useStore } from "../state.ts";

export type LibraryRoute =
  | { kind: "library" }
  | { kind: "libraryPath"; slug: string }
  | { kind: "libraryLesson"; slug: string; n: number };

/** `/library`, `/library/<slug>` or `/library/<slug>/<n>` → a route, else null. */
export function parseLibraryRoute(pathname: string): LibraryRoute | null {
  if (pathname === "/library" || pathname === "/library/") return { kind: "library" };
  if (!pathname.startsWith("/library/")) return null;
  const rest = pathname.slice("/library/".length).replace(/\/+$/, "");
  const [rawSlug, rawN, extra] = rest.split("/");
  if (!rawSlug || extra !== undefined) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    return null;
  }
  if (rawN === undefined) return { kind: "libraryPath", slug };
  const n = Number(rawN);
  if (!Number.isInteger(n) || n < 1) return null;
  return { kind: "libraryLesson", slug, n };
}

/** The lessons of a path in reading order, numbered from 1. */
export function lessonCount(path: LibraryPath): number {
  return path.units.reduce((sum, unit) => sum + unit.lessons.length, 0);
}

/** The document title for a library route, given the shelf (or null while
 *  it loads). */
export function libraryDocumentTitle(route: LibraryRoute, shelf: LibraryPath[] | null, siteTitle: string): string {
  const libraryName = useStore.getState().library?.title || t("libraryTitle");
  if (route.kind === "library") return `${libraryName} · ${siteTitle}`;
  const path = shelf?.find((p) => p.slug === route.slug);
  if (!path) return `${libraryName} · ${siteTitle}`;
  if (route.kind === "libraryPath") return `${path.title} · ${siteTitle}`;
  let n = 0;
  for (const unit of path.units) {
    for (const lesson of unit.lessons) {
      n += 1;
      if (n === route.n) return `${lesson.title} · ${path.title}`;
    }
  }
  return `${path.title} · ${siteTitle}`;
}
