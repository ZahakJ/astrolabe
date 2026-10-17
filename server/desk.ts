// The Writing desk's reads (docs/writing-desk.md, shared/desk.ts).
//
// ADMIN ONLY, every function here. The desk is the owner's list of what they
// mean to write — titles, angles, plans — and a plan is exactly what a visitor
// must never learn exists. The routes in server/api.ts refuse a limited
// session before calling in, and nothing here is reachable from the blog, the
// feed, the sitemap or search, which read the published set and nothing else.

import { noteTitleOf } from "../shared/noteFormat.ts";
import { stageOf, type DeskData, type DeskPiece, type DeskPieceDetail, type DeskSeries, type DeskSourceRow } from "../shared/desk.ts";
import { wordGoalOf } from "../shared/wordGoal.ts";
import { backlinks, notes, postBasics, resolveEmbed, resolveLink, templateMatcher, type NoteRecord } from "./indexer.ts";
import { deskWordPoints } from "./deskWords.ts";

function goalOf(record: NoteRecord): number | null {
  const raw = record.props.goal;
  return raw === undefined ? null : wordGoalOf(`---\ngoal: ${raw}\n---\n`);
}

function pieceOf(record: NoteRecord): DeskPiece | null {
  const meta = record.desk;
  if (meta === null || meta.kind !== "essay") return null;
  const resolved = meta.series === null ? null : resolveLink(meta.series, false, null);
  const series = resolved !== null && notes.get(resolved)?.desk?.kind === "series" ? resolved : null;
  return {
    path: record.path,
    title: record.title,
    status: meta.status,
    stage: stageOf(meta.status, record.published),
    published: record.published,
    series,
    seriesRef: meta.series,
    lang: meta.lang ?? (record.arabic === true ? "ar" : record.arabic === false ? "en" : null),
    angle: meta.angle,
    priority: meta.priority,
    due: meta.due,
    next: meta.next,
    words: postBasics(record).words,
    goal: goalOf(record),
    mtimeMs: record.mtimeMs,
  };
}

function seriesOf(record: NoteRecord): DeskSeries | null {
  const meta = record.desk;
  if (meta === null || meta.kind !== "series") return null;
  return {
    path: record.path,
    title: record.title,
    status: meta.status,
    description: meta.description || meta.angle,
    lang: meta.lang,
    angle: meta.angle,
    published: record.published,
    // Resolved with the visitor filter off, like the blog's own series table:
    // which note an entry names is the owner's question here.
    slots: (record.seriesRefs ?? []).map((ref) => ({ ref, path: resolveLink(ref, false, null) })),
    mtimeMs: record.mtimeMs,
  };
}

/** Every piece and every series in the vault. Templates are left out: a
 *  stencil with `kind: essay` in it is not something the owner means to
 *  write. */
export function deskData(): DeskData {
  const isTemplate = templateMatcher();
  const pieces: DeskPiece[] = [];
  const series: DeskSeries[] = [];
  for (const record of notes.values()) {
    if (record.desk === null || isTemplate(record.path)) continue;
    const piece = pieceOf(record);
    if (piece !== null) pieces.push(piece);
    const s = seriesOf(record);
    if (s !== null) series.push(s);
  }
  pieces.sort((a, b) => a.path.localeCompare(b.path));
  series.sort((a, b) => a.title.localeCompare(b.title));
  return { pieces, series };
}

const BOOK = /\.(pdf|epub)$/i;

export function deskPiece(path: string): DeskPieceDetail | null {
  const record = notes.get(path);
  if (record === undefined) return null;
  const piece = pieceOf(record);
  if (piece === null) return null;
  const linked: DeskSourceRow[] = [];
  const books: DeskSourceRow[] = [];
  const clips: (DeskSourceRow & { url: string })[] = [];
  const seen = new Set<string>([record.path]);
  const add = (target: string | null): void => {
    if (target === null || seen.has(target)) return;
    seen.add(target);
    if (BOOK.test(target)) {
      books.push({ path: target, title: target.slice(target.lastIndexOf("/") + 1) });
      return;
    }
    const other = notes.get(target);
    if (other === undefined) return;
    const url = other.props.source ?? "";
    if (/^https?:\/\//i.test(url)) clips.push({ path: other.path, title: other.title, url });
    else linked.push({ path: other.path, title: other.title });
  };
  for (const link of record.links) add(resolveEmbed(link.target, false, null));
  for (const asset of record.assets) if (BOOK.test(asset)) add(asset);
  const back = backlinks(record.path, false, null)
    .filter((b) => b.path !== record.path)
    .map((b) => ({ path: b.path, title: b.title }));
  const unique = back.filter((b, i) => back.findIndex((x) => x.path === b.path) === i);
  return {
    piece,
    seriesTitle: piece.series === null ? null : noteTitleOf(piece.series),
    linked,
    books,
    clips,
    backlinks: unique,
    words: deskWordPoints(record.path),
  };
}
