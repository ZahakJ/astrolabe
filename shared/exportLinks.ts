// The link rewrite an export performs on its COPIES: `[[Wikilinks]]` and
// `![[embeds]]` become standard relative Markdown links, so a folder of notes
// handed to someone with a plain Markdown viewer — or a static site
// generator, or a colleague on a different tool — still connects.
//
// Pure, and in shared/ rather than in server/export.ts, because the rule is
// worth a test of its own and the server is the wrong place to unit-test a
// string transform. The vault is never touched: the function takes text and
// answers text, and the export writes the answer into the archive.
//
// The two honesty rules, both of which are the difference between a link
// that works and a link that looks like it works:
//
//   A TARGET THE RESOLVER CANNOT NAME IS LEFT EXACTLY AS WRITTEN. The caller
//   answers null for a note it could not resolve OR for one that is not in
//   the archive, and the wikilink stays a wikilink — a `[Note](Note.md)`
//   pointing at a file that is not there is worse than the original, because
//   the original at least says what it was. The docs say this out loud.
//
//   CODE IS NOT PROSE. A wikilink inside a fence or an inline span is text
//   about wikilinks, and the indexer's own language detector already treats
//   it that way; rewriting it would change the note's meaning.

import { slugAnchor } from "./tex.ts";
import { isNotePath } from "./noteFormat.ts";

/** The indexer's wikilink shape (server/indexer.ts `wikilinkRegex`) with an
 *  optional embed bang in front: target, `#anchor`, `|label`. Kept in step by
 *  the parity test rather than by importing across the boundary — shared/
 *  must not depend on server/. */
const WIKI_RE = /(!?)\[\[([^[\]|#]+)(#[^[\]|]*)?(\|[^[\]]*)?\]\]/g;

/** The one function every export path calls to turn a wikilink target into
 *  a vault-relative path. `null` means "leave it alone". */
export type LinkResolver = (target: string) => string | null;

/** The path from `fromPath`'s folder to `toPath`, POSIX, with `..` where the
 *  two diverge — what a standard Markdown link needs to be portable between
 *  the archive's folders. Both arguments are vault-relative. */
export function relativePath(fromPath: string, toPath: string): string {
  const from = fromPath.split("/").slice(0, -1);
  const to = toPath.split("/");
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared++;
  const up = from.length - shared;
  const parts = [...Array<string>(up).fill(".."), ...to.slice(shared)];
  return parts.join("/");
}

/** Percent-encode the handful of characters a Markdown link destination
 *  cannot carry bare. Everything else — Arabic letters above all — stays as
 *  it is, so the link reads as the file it names in a diff and an editor. */
export function encodeLinkPath(rel: string): string {
  return rel.replace(/[%\s()#?<>]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}

/** The `#…` half of a link, slugged the way the reading view ids a heading
 *  (client/reading/toc.ts `Slugger`, first occurrence) — so `[[Note#My
 *  Heading]]` lands on `note.md#my-heading` in any viewer that slugs the
 *  same way, which is most of them. A block reference (`#^id`) has no
 *  standard equivalent and is dropped rather than turned into a slug that
 *  points nowhere. */
function anchorPart(anchor: string | undefined): string {
  if (!anchor) return "";
  const text = anchor.slice(1).trim();
  if (text === "" || text.startsWith("^")) return "";
  return `#${slugAnchor(text)}`;
}

/** Rewrite one line's prose (never its code spans). */
function rewriteProse(text: string, fromPath: string, resolve: LinkResolver): string {
  return text.replace(WIKI_RE, (whole, bang: string, rawTarget: string, anchor?: string, pipe?: string) => {
    const target = rawTarget.trim();
    if (target === "") return whole;
    const resolved = resolve(target);
    if (resolved === null) return whole;
    const label = pipe ? pipe.slice(1).trim() : "";
    const hash = anchorPart(anchor);
    const dest = (resolved === fromPath ? "" : encodeLinkPath(relativePath(fromPath, resolved))) + hash;
    if (dest === "") return whole;
    const isNote = isNotePath(resolved);
    if (bang === "!" && !isNote) {
      // A picture, a PDF, an audio file: the embed stays an embed. The alt
      // text is the label when one was written, else the file's own name —
      // an image with no alt is the one thing every accessibility checker
      // flags in an export.
      const alt = label || resolved.slice(resolved.lastIndexOf("/") + 1);
      return `![${alt}](${dest})`;
    }
    // A transclusion of a NOTE has no standard equivalent; it becomes a link
    // to the note, which is the honest reading of "the whole of that note
    // goes here" once there is no renderer to put it there.
    const text = label || (anchor && anchor.length > 1 ? `${target}${anchor}` : target);
    return `[${text}](${dest})`;
  });
}

/** Rewrite every wikilink and embed in `md` that `resolve` can name, from
 *  the point of view of the note at `fromPath`. Fences and inline code are
 *  left alone; so is everything `resolve` answers null for. Line endings,
 *  spacing and every other byte survive. */
export function rewriteWikilinks(md: string, fromPath: string, resolve: LinkResolver): string {
  const lines = md.split("\n");
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const open = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence !== null) {
      // The fence closes on a marker of the same character at least as long.
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      continue;
    }
    if (open) {
      fence = open[1];
      continue;
    }
    if (!line.includes("[[")) continue;
    // Inline code spans keep their text; everything between them is prose.
    lines[i] = line
      .split(/(`+[^`]*`+)/)
      .map((part, idx) => (idx % 2 === 1 ? part : rewriteProse(part, fromPath, resolve)))
      .join("");
  }
  return lines.join("\n");
}
