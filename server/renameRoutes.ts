// Rename and folder move, with every link that named the old path rewritten.
// Mounted from server/api.ts below the auth guard; moved out of that file
// unchanged.

import { Hono } from "hono";
import type { NoteData } from "../shared/types.ts";
import { backlinks, indexFile, notesAffectedByFolderMove, whenIndexed, wikilinkRegex } from "./indexer.ts";
import { dirOf, rewriteDestinations, rewriteForMove } from "./moveLinks.ts";
import { isTexPath, stripNoteExt } from "../shared/noteFormat.ts";
import { jsonBody, requiredString } from "./requestBody.ts";
import { moveAnnotations } from "./annotations.ts";
import { moveFolder, normalizeRel, readNote, renameNote, suppressWatcherEcho, writeNote } from "./vault.ts";

export const renameRoutes = new Hono();

renameRoutes.post("/rename", async (c) => {
  const body = await jsonBody(c);
  const from = requiredString(body, "path");
  const to = requiredString(body, "toPath");
  await renameWithLinkRewrite(from, to);
  // The note's annotations move with it (server/annotations.ts): keyed by
  // path, so the rename is the one moment they would otherwise be lost.
  moveAnnotations(from, to);
  return c.json({ ok: true });
});

// ----------------------------------------------------- rename + link rewrite

function basenameNoExt(relPath: string): string {
  return stripNoteExt(relPath.slice(relPath.lastIndexOf("/") + 1));
}

/** Rename a note; if its title changed, rewrite [[wikilinks]] in notes that pointed at it.
 *
 *  This is also the MOVE endpoint — a drag in the tree and the "Move to…"
 *  command both land here — and a move is not a rename with a different string.
 *  Two things happen only when the FOLDER changes, and neither used to:
 *
 *   - **The moved note's own relative embeds.** `![alt](Media/x.png)` and
 *     `[see](../Ideas/Note.md)` resolve against the note's OWN directory. Drag a
 *     note one folder up and every one of them points somewhere else: the admin
 *     sees broken images, and a published note serves 404s to visitors, because
 *     the publish allowlist is built from the same resolution (`parseAssets()`).
 *     Nothing in the product said so — the images simply stopped loading.
 *   - **Other notes' markdown links TO it.** The old rewrite only knew
 *     `[[wikilinks]]`, so `[see](Ideas/Note.md)` in another note dangled.
 *
 *  Basename-form `[[Note]]` links are deliberately untouched by the move half:
 *  they resolve by name, so a move cannot break them. */
export async function renameWithLinkRewrite(from: string, to: string): Promise<void> {
  const fromPath = normalizeRel(from);
  const toPath = normalizeRel(to);
  const oldTitle = basenameNoExt(fromPath);
  const newTitle = basenameNoExt(toPath);
  const titleChanged = oldTitle.toLowerCase() !== newTitle.toLowerCase();
  const oldPathNoExt = stripNoteExt(fromPath).toLowerCase();
  const newPathNoExt = stripNoteExt(toPath);
  const moved: ReadonlyMap<string, string> = new Map([[fromPath, toPath]]);
  // Capture linkers before the rename, while links still resolve to the old
  // path. Path-form links ([[Folder/Note]]) break on ANY move, so linkers are
  // captured even when the basename is unchanged.
  const linkers = [...new Set(backlinks(fromPath, false, null).map((b) => b.path))];

  await renameNote(fromPath, toPath);

  // The note's OWN body, at its new address: markdown destinations resolved
  // against the folder it left, re-expressed from the folder it arrived in.
  if (dirOf(fromPath) !== dirOf(toPath)) {
    try {
      const note: NoteData = await readNote(toPath);
      const rewritten = rewriteDestinations(
        note.content,
        dirOf(fromPath),
        dirOf(toPath),
        new Map(),
      );
      if (rewritten !== note.content) {
        // The `renamed` event already told everyone this file moved; a second
        // `changed` for the same gesture is noise.
        suppressWatcherEcho(toPath);
        // THE LINK REWRITES STAY UNCONDITIONAL, and that is a decision rather
        // than an oversight — the one exception to "every read-modify-write
        // carries its base" that /api/publish and /api/frontmatter now follow.
        // A rename has ALREADY moved the file by the time this loop runs, so a
        // 409 here cannot be reported as "try again": it would abort a gesture
        // half-applied, leaving a vault whose links point at a name that no
        // longer exists. It also touches notes the reader never named, where a
        // refusal is a message about a file they are not looking at. The
        // failure it accepts in exchange is bounded and self-repairing — one
        // `[[wikilink]]` spelling lost to a concurrent edit of the SAME line of
        // the SAME third-party note, which the next rename of that target
        // rewrites correctly anyway.
        await writeNote(toPath, rewritten, undefined, "rename");
      }
    } catch (err) {
      console.error(`move: failed to rewrite embeds in ${toPath}:`, err);
    }
  }

  for (const linker of linkers) {
    // A note never links to itself, but if it somehow did it now lives at `to`.
    const at = linker === fromPath ? toPath : linker;
    try {
      const note: NoteData = await readNote(at);
      let rewritten = note.content.replace(wikilinkRegex(), (whole, target: string, heading?: string, alias?: string) => {
        const t = target.trim();
        if (titleChanged && t.toLowerCase() === oldTitle.toLowerCase()) {
          return `[[${newTitle}${heading ?? ""}${alias ?? ""}]]`;
        }
        // Path-form target pointing at the old path → rewrite to the new path.
        // PATH-form only: a bare `[[Solo]]` resolves by basename and survives a
        // move untouched, and for a note at the vault ROOT its path spelling IS
        // its basename — so without this guard, moving one root note into a
        // folder rewrote every plain `[[Solo]]` in the vault into
        // `[[folder/Solo]]`, converting portable links into brittle ones and
        // dirtying files that had nothing wrong with them.
        const norm = t.toLowerCase().replace(/\\/g, "/").replace(/^\.?\/+/, "");
        if (norm.includes("/") && (norm === oldPathNoExt || norm === `${oldPathNoExt}.md`)) {
          return `[[${newPathNoExt}${heading ?? ""}${alias ?? ""}]]`;
        }
        return whole;
      });
      // …and the other syntax: `[see](Ideas/Note.md)` pointing at the file that
      // just moved. Same resolution the renderers use, so the allowlist and the
      // page agree afterwards.
      rewritten = rewriteDestinations(rewritten, dirOf(at), dirOf(at), moved);
      // …and, in a `.tex` linker, `\note{Old Title}` — Astrolabe's OWN macro, so
      // it is ours to keep true. `\input`, `\cite` and `\ref` are deliberately
      // NOT rewritten: they belong to the document's own semantics, and
      // silently editing them could change what `pdflatex` produces. The
      // `%% [[…]] %%` form needs nothing here — it is a wikilink, and the pass
      // above already caught it.
      if (isTexPath(at)) rewritten = rewriteTexNoteMacros(rewritten, oldTitle, newTitle, titleChanged);
      if (rewritten !== note.content) {
        // Unconditional, per the paragraph above: the rename is already done,
        // and a refusal here would abort it half-applied. The version this
        // leaves is tagged "rename", so a timeline can say why a note the
        // reader never touched has a copy from today.
        await writeNote(at, rewritten, undefined, "rename");
        await indexFile(at);
      }
    } catch (err) {
      console.error(`rename: failed to rewrite links in ${at}:`, err);
    }
  }
  // The client refetches tree/graph/search on the 200; index before answering
  // rather than a watcher debounce later, so what it gets back is already true.
  await indexFile(toPath);
  await whenIndexed();
}

/** Rewrite `\note{Old}` / `\note[alias]{Old}` to the new title. Only the
 *  TARGET moves; the optional display text is the author's prose and is left
 *  exactly as written. Matching is case-insensitive on the title, the same
 *  rule wikilink resolution uses, and `\#anchor` suffixes ride along
 *  untouched — a rename changes which note is meant, never which place in it. */
function rewriteTexNoteMacros(
  src: string,
  oldTitle: string,
  newTitle: string,
  titleChanged: boolean,
): string {
  if (!titleChanged) return src;
  const want = oldTitle.toLowerCase();
  return src.replace(
    /\\note(\[[^\]]*\])?\{([^{}]*)\}/g,
    (whole, alias: string | undefined, target: string) => {
      const raw = target.trim();
      const hash = raw.search(/\\?#/);
      const head = (hash >= 0 ? raw.slice(0, hash) : raw).trim();
      const tail = hash >= 0 ? raw.slice(hash) : "";
      if (head.toLowerCase() !== want) return whole;
      return `\\note${alias ?? ""}{${newTitle}${tail}}`;
    },
  );
}

export interface MoveFolderResponse {
  ok: true;
  /** `.md` files that travelled with the folder — the toast's number. */
  notes: number;
  /** How many notes had links or embeds rewritten. */
  rewritten: number;
}

/** Move a folder, then repair every link the move would otherwise have broken.
 *
 *  The order is the whole correctness argument, and it is the folder-DELETE
 *  order with one extra step:
 *   1. sample the affected notes while their links still resolve to the OLD
 *      paths (`notesAffectedByFolderMove`, one pass over the index);
 *   2. move — one `fs.rename`, one synthetic `{kind:"renamed", dir:true}` event,
 *      the watcher's per-file storm suppressed;
 *   3. `whenIndexed()` — the event drives `reindexFolderMove`, so from here on
 *      the index describes the new vault;
 *   4. rewrite: path-form wikilinks and markdown destinations, in the notes
 *      that moved AND in the notes that pointed into the folder;
 *   5. reindex what was rewritten, then answer. A `/api/tree` + `/api/graph`
 *      refetch on the 200 is already correct — no debounce race.
 *
 *  A rewrite that throws is logged and skipped, never retried into a half-state:
 *  the FILES are already where the caller asked, and one unreadable note must
 *  not strand the other 714. */
export async function moveFolderWithLinkRewrite(from: string, to: string): Promise<MoveFolderResponse> {
  const fromPath = normalizeRel(from);
  const affected = notesAffectedByFolderMove(fromPath);
  const { notes, moved } = await moveFolder(fromPath, to);
  await whenIndexed();

  const map = new Map(moved.map((m) => [m.from, m.to]));
  const rewritten: string[] = [];
  for (const before of affected) {
    const after = map.get(before) ?? before;
    try {
      const note: NoteData = await readNote(after);
      const next = rewriteForMove(note.content, before, after, map);
      if (next === note.content) continue;
      // Notes INSIDE the folder are already covered by the one dir event;
      // notes outside it get their own `changed`, which is what tells an open
      // editor to reload a body that changed underneath it.
      if (map.has(before)) suppressWatcherEcho(after);
      // Unconditional, for the reason the rename rewrite gives: the folder has
      // already moved, so a 409 could only abort a gesture half-applied.
      await writeNote(after, next, undefined, "rename");
      rewritten.push(after);
    } catch (err) {
      console.error(`move: failed to rewrite links in ${after}:`, err);
    }
  }
  for (const notePath of rewritten) await indexFile(notePath);
  return { ok: true, notes, rewritten: rewritten.length };
}
