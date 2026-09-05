// THE LIBRARY, resolved for one session: the paths settings.json declares,
// each with the folder's own structure read off the index — its subfolders
// as units, its published notes as lessons — and scoped to what THIS session
// may read, so a visitor is never handed the name of a note they would be
// 404'd for. The rules for a legal path and for the order of things live in
// shared/library.ts; this file joins them to the index.

import type { Context } from "hono";
import {
  compareLessons,
  compareUnits,
  unitOfName,
} from "../shared/library.ts";
import type { LibraryLesson, LibraryPath, LibraryPathRef, LibraryUnit } from "../shared/types.ts";
import { isPublishLimited } from "./auth.ts";
import { libraryLessons, type FilterLang } from "./indexer.ts";
import { languageScope } from "./language.ts";
import { getSettings } from "./settings.ts";

/** One path's structure for a scope, or null when the session may read no
 *  lesson in it — a path with nothing behind it is not sent. */
export function resolveLibraryPath(ref: LibraryPathRef, visitor: boolean, lang: FilterLang): LibraryPath | null {
  const lessons = libraryLessons(ref.folder, visitor, lang);
  if (lessons.length === 0) return null;
  const prefix = ref.folder.endsWith("/") ? ref.folder : `${ref.folder}/`;
  const byUnit = new Map<string, LibraryLesson[]>();
  for (const lesson of lessons) {
    const rel = lesson.path.slice(prefix.length);
    const slash = rel.indexOf("/");
    const key = slash === -1 ? "" : rel.slice(0, slash);
    let list = byUnit.get(key);
    if (!list) byUnit.set(key, (list = []));
    const { published: _published, ...wire } = lesson;
    list.push(wire);
  }
  const units: LibraryUnit[] = [];
  for (const [key, list] of byUnit) {
    if (key === "") {
      units.push({ key, name: "", kind: "intro", number: null, lessons: list.sort(compareLessons("")) });
      continue;
    }
    const shape = unitOfName(key);
    units.push({ key, ...shape, lessons: list.sort(compareLessons(shape.name)) });
  }
  // The introduction (notes in the path's own folder) always opens the path;
  // the rest sort by their number, then their name.
  units.sort((a, b) => {
    if (a.kind === "intro" && b.kind !== "intro") return -1;
    if (b.kind === "intro" && a.kind !== "intro") return 1;
    return compareUnits(a, b);
  });
  const count = lessons.length;
  const minutes = lessons.reduce((sum, l) => sum + l.readingMinutes, 0);
  const out: LibraryPath = {
    id: ref.id,
    slug: ref.slug,
    kind: ref.kind,
    title: ref.title,
    units,
    lessons: count,
    minutes,
  };
  if (ref.blurb) out.blurb = ref.blurb;
  if (ref.cover) out.cover = ref.cover;
  if (ref.source) out.source = ref.source;
  return out;
}

/** Every visible path this session may read at least one lesson of, in
 *  shelf order. Empty when the feature is off. */
export function libraryFor(c: Context): LibraryPath[] {
  const settings = getSettings();
  const lib = settings.library;
  if (lib?.enabled !== true) return [];
  const limited = isPublishLimited(c);
  const lang = languageScope(c, limited).lang;
  const out: LibraryPath[] = [];
  for (const ref of lib.paths ?? []) {
    if (ref.hidden) continue;
    const resolved = resolveLibraryPath(ref, limited, lang);
    if (resolved) out.push(resolved);
  }
  return out;
}
