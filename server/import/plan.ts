// THE IMPORT: preview, commit, undo (docs/import.md).
//
// PREVIEW WRITES NOTHING. An upload is converted (./notion.ts, ./evernote.ts,
// ./obsidian.ts) and planned in memory: every note given a free path under the
// target folder (`resolveTargets` — the vault's own notes and the export's
// other notes both count, and nothing is ever overwritten), every attachment a
// free name in the folder this vault's attachment setting names for the
// import, every link rewritten — a note's Markdown links to other imported
// notes into `[[wikilinks]]` by their final names, embeds renamed where an
// attachment had to be, and Markdown destinations re-resolved from the note's
// new folder to the attachment's new home through server/moveLinks.ts, the
// same code a folder drag uses. What the reader sees is that plan, counted.
//
// COMMIT WRITES THE PLAN, and says so as it goes: one progress line per file
// on a streamed answer, then an undo id. NOTHING IS PUBLISHED — no converter
// writes a `publish:` key and the Obsidian one takes Publish's out — so an
// import is private until the owner publishes a note by hand.
//
// UNDO is bulkRewrite's contract (server/bulkRewrite.ts) for created files:
// each file the import wrote is moved to the vault's trash — recoverable
// there — unless it has been edited since (its mtime moved), in which case it
// is left and listed; the folders the import made are removed once empty. The
// bundle lives in this process for a day; a restart forgets it, and the trash
// and git history are the floor under that.

import { randomUUID } from "node:crypto";
import { existsSync, promises as fsp } from "node:fs";
import path from "node:path";
import { normalizeFolder } from "../../shared/attachments.ts";
import { frontmatterBlock, linksToWikilinks, renameEmbeds, resolveTargets, type Collision, type ImportPreview, type ImportProgress, type ImportSourceKind, type ImportUndoResult } from "../../shared/importPlan.ts";
import { registerAttachment, indexFile, whenIndexed } from "../indexer.ts";
import { rewriteDestinations, rewriteWikilinkPaths } from "../moveLinks.ts";
import { uploadDirFor } from "../site.ts";
import { deleteAttachment, deleteNote, emitEvent, normalizeRel, safeAbs, suppressWatcherEcho, VaultError, writeNote } from "../vault.ts";
import { baseOf, dirOf, type Converted, type ExportFile } from "./common.ts";
import { convertEvernote } from "./evernote.ts";
import { convertNotion } from "./notion.ts";
import { convertObsidian } from "./obsidian.ts";

const PLAN_TTL_MS = 30 * 60_000;
const PLANS_MAX = 4;
const UNDO_TTL_MS = 24 * 60 * 60_000;

interface Plan {
  preview: ImportPreview;
  notes: Array<{ path: string; content: string }>;
  attachments: Array<{ path: string; bytes: Uint8Array }>;
}

interface UndoBundle {
  at: number;
  notes: Array<{ path: string; mtimeMs: number }>;
  attachments: Array<{ path: string; mtimeMs: number }>;
  /** Folders the import created, deepest first. */
  dirs: string[];
}

const plans = new Map<string, Plan>();
const undos = new Map<string, UndoBundle>();

function prune(): void {
  const now = Date.now();
  for (const [id, p] of plans) if (p.preview.expires < now) plans.delete(id);
  while (plans.size > PLANS_MAX) plans.delete(plans.keys().next().value as string);
  for (const [id, u] of undos) if (now - u.at > UNDO_TTL_MS) undos.delete(id);
}

export function convert(source: ImportSourceKind, files: ExportFile[]): Converted {
  if (source === "notion") return convertNotion(files);
  if (source === "evernote") return convertEvernote(files);
  return convertObsidian(files);
}

function exists(rel: string): boolean {
  try {
    return existsSync(safeAbs(rel));
  } catch {
    return true; // a path the vault refuses is not free
  }
}

/** Plan an import of `files` from `source` into `folder`. Writes nothing. */
export function planImport(source: ImportSourceKind, files: ExportFile[], folderRaw: string): ImportPreview {
  prune();
  const folder = normalizeRel(normalizeFolder(folderRaw));
  const conv = convert(source, files);
  if (conv.notes.length === 0) throw new VaultError(400, "The export holds no notes this importer can read", "importNoNotes");
  const under = (p: string): string => (folder === "" ? p : `${folder}/${p}`);

  // 1. Every note a free path.
  const { targets, collisions } = resolveTargets(
    conv.notes.map((n) => ({ source: n.source, path: under(n.want) })),
    exists,
  );

  // 2. Every attachment a free name in the attachments folder.
  const attachDir = uploadDirFor(folder);
  const att = resolveTargets(
    conv.attachments.map((a) => ({ source: a.source, path: attachDir === "" ? a.name : `${attachDir}/${a.name}` })),
    exists,
  );
  const allCollisions: Collision[] = [...collisions, ...att.collisions];

  // The tables the link rewriting reads: export path → vault path, for notes
  // and attachments alike (moveLinks' MoveMap), and old name → new name for
  // the wikilink embeds that name a file by itself.
  const moved = new Map<string, string>();
  const noteAt = new Map<string, string>();
  for (const n of conv.notes) {
    const to = targets.get(n.source)!;
    noteAt.set(n.source, to);
    moved.set(n.source, to);
  }
  const renamed = new Map<string, string>();
  for (const a of conv.attachments) {
    const to = att.targets.get(a.source)!;
    moved.set(a.source, to);
    const finalName = baseOf(to);
    // A path-form embed (`![[Attachments/x.png]]`) names a folder the file
    // has left: it becomes the name alone.
    renamed.set(a.source, finalName);
    if (finalName !== a.name) renamed.set(a.name, finalName);
  }
  // A note that had to take a new name takes its wikilinks with it.
  for (const n of conv.notes) {
    const was = baseOf(n.want).replace(/\.md$/i, "");
    const now = baseOf(targets.get(n.source)!).replace(/\.md$/i, "");
    if (was !== now) renamed.set(was, now);
  }

  let links = 0;
  const notes: Plan["notes"] = [];
  for (const n of conv.notes) {
    const to = targets.get(n.source)!;
    let body = n.body;
    const wiki = linksToWikilinks(body, n.dir, (p) => noteAt.get(p) ?? null);
    body = wiki.text;
    links += wiki.count;
    const emb = renameEmbeds(body, renamed);
    body = emb.text;
    links += emb.count;
    // Markdown destinations (`![](media/x.png)`, rooted or relative) from the
    // note's export folder to its vault folder, the attachments' new home.
    const before = body;
    body = rewriteDestinations(rewriteWikilinkPaths(body, moved), n.dir, dirOf(to), moved);
    if (body !== before) links += countDiff(before, body);
    const head = n.fields === null ? "" : frontmatterBlock(n.fields);
    const title = n.title !== null && !/^# /.test(body.trimStart()) ? `# ${n.title}\n\n` : "";
    const content = n.fields === null ? body : `${head}${head === "" ? "" : "\n"}${title}${body.replace(/^\s+/, "")}`.replace(/\s*$/, "\n");
    notes.push({ path: to, content });
  }
  const attachments = conv.attachments.map((a) => ({ path: att.targets.get(a.source)!, bytes: a.bytes }));

  const planId = randomUUID();
  const preview: ImportPreview = {
    planId,
    source,
    folder,
    notes: notes.length,
    attachments: attachments.length,
    links,
    collisions: allCollisions,
    frontmatter: conv.stats,
    sample: notes.slice(0, 12).map((n) => n.path),
    attachmentsFolder: attachDir,
    skipped: conv.skipped,
    expires: Date.now() + PLAN_TTL_MS,
  };
  plans.set(planId, { preview, notes, attachments });
  return preview;
}

/** How many link-shaped spans differ between two versions of a note. */
function countDiff(a: string, b: string): number {
  const re = /!?\[[^\]\n]*\]\([^)\n]*\)|!?\[\[[^\]\n]*\]\]/g;
  const xs = a.match(re) ?? [];
  const ys = b.match(re) ?? [];
  let n = 0;
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) if (xs[i] !== ys[i]) n++;
  return n;
}

export function planPreview(planId: string): ImportPreview | null {
  prune();
  return plans.get(planId)?.preview ?? null;
}

/** Write a plan. `onProgress` hears one line per file. Resolves to the last
 *  line: the undo id and what was written. A file whose path has been taken
 *  since the preview is not overwritten: the commit stops there, and what it
 *  had written is undoable like any commit. */
export async function commitImport(planId: string, onProgress: (p: ImportProgress) => void = () => {}): Promise<Extract<ImportProgress, { type: "done" }>> {
  prune();
  const plan = plans.get(planId);
  if (!plan) throw new VaultError(410, "That preview has expired; choose the export again", "importPlanExpired");
  plans.delete(planId);
  const total = plan.notes.length + plan.attachments.length;
  const bundle: UndoBundle = { at: Date.now(), notes: [], attachments: [], dirs: [] };
  const undoId = randomUUID();
  undos.set(undoId, bundle);
  // The folders that are not there yet, so undo can take them away again.
  const dirs = new Set<string>();
  for (const f of [...plan.notes, ...plan.attachments]) {
    for (let d = dirOf(f.path); d !== "" && !dirs.has(d); d = dirOf(d)) {
      if (existsSync(safeAbs(d))) break;
      dirs.add(d);
    }
  }
  bundle.dirs = [...dirs].sort((a, b) => b.split("/").length - a.split("/").length);
  let done = 0;
  for (const a of plan.attachments) {
    const abs = safeAbs(a.path);
    if (existsSync(abs)) throw new VaultError(409, `${a.path} appeared since the preview`, "importTaken");
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    suppressWatcherEcho(a.path);
    await fsp.writeFile(abs, a.bytes, { flag: "wx" });
    registerAttachment(a.path);
    emitEvent({ kind: "created", path: a.path });
    bundle.attachments.push({ path: a.path, mtimeMs: (await fsp.stat(abs)).mtimeMs });
    onProgress({ type: "progress", done: ++done, total, path: a.path });
  }
  for (const n of plan.notes) {
    if (existsSync(safeAbs(n.path))) throw new VaultError(409, `${n.path} appeared since the preview`, "importTaken");
    suppressWatcherEcho(n.path);
    const written = await writeNote(n.path, n.content);
    emitEvent({ kind: "created", path: written.path });
    await indexFile(written.path);
    bundle.notes.push({ path: written.path, mtimeMs: written.mtimeMs });
    onProgress({ type: "progress", done: ++done, total, path: written.path });
  }
  const last = { type: "done" as const, undoId, notes: bundle.notes.map((n) => n.path), attachments: bundle.attachments.map((a) => a.path) };
  onProgress(last);
  return last;
}

/** Take an import back: every file it wrote to the trash, unless edited since. */
export async function undoImport(undoId: string): Promise<ImportUndoResult> {
  prune();
  const bundle = undos.get(undoId);
  if (!bundle) throw new VaultError(410, "That import can no longer be taken back", "undoExpired");
  undos.delete(undoId);
  const removed: string[] = [];
  const kept: string[] = [];
  const unchanged = async (rel: string, mtimeMs: number): Promise<boolean> => {
    try {
      return (await fsp.stat(safeAbs(rel))).mtimeMs === mtimeMs;
    } catch {
      return false;
    }
  };
  for (const n of bundle.notes) {
    if (!(await unchanged(n.path, n.mtimeMs))) {
      kept.push(n.path);
      continue;
    }
    await deleteNote(n.path);
    removed.push(n.path);
  }
  for (const a of bundle.attachments) {
    if (!(await unchanged(a.path, a.mtimeMs))) {
      kept.push(a.path);
      continue;
    }
    await deleteAttachment(a.path);
    removed.push(a.path);
  }
  for (const d of bundle.dirs) {
    try {
      await fsp.rmdir(safeAbs(d));
      emitEvent({ kind: "deleted", path: d, dir: true });
    } catch {
      /* not empty: something else lives there now */
    }
  }
  await whenIndexed();
  return { removed, kept };
}
