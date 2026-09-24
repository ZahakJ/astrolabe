// /api/import — the import wizard's door (docs/import.md,
// server/import/plan.ts).
//
// Mounted BELOW the auth guard: an import writes notes and files into the
// vault, which is the owner's to do, and every route here asks for the admin
// itself as well (a visitor preview is a 401).
//
//   POST /import/preview   multipart: source (notion|evernote|obsidian),
//                          folder, and either `file` (a .zip or .enex) or
//                          several `files` with a `paths` field each (a
//                          folder picked in the browser: the relative path
//                          rides beside the file, because a multipart file
//                          name carries no folders)
//                          → ImportPreview; nothing written
//   POST /import/commit    {planId} → application/x-ndjson, one ImportProgress
//                          per line, the last one `done` with the undo id
//   POST /import/undo      {undoId} → {removed, kept}

import { Hono, type Context } from "hono";
import { stream } from "hono/streaming";
import { extensionOf, folderError } from "../shared/attachments.ts";
import { isImportSource, IMPORT_FOLDER_DEFAULT } from "../shared/importPlan.ts";
import { NOTES_IMPORT_MAX_BYTES } from "../shared/limits.ts";
import { isPublishLimited } from "./auth.ts";
import { dropCommonRoot, unzipExport, type ExportFile } from "./import/common.ts";
import { commitImport, planImport, undoImport } from "./import/plan.ts";
import { VaultError } from "./vault.ts";

export const importRoutes = new Hono();

function adminOnly(c: Context): void {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
}

async function jsonField(c: Context, key: string): Promise<string> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new VaultError(400, "Invalid JSON body");
  }
  const v = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined;
  if (typeof v !== "string" || v === "") throw new VaultError(400, `Body field "${key}" must be a non-empty string`);
  return v;
}

importRoutes.post("/import/preview", async (c) => {
  adminOnly(c);
  let form: Record<string, unknown>;
  try {
    form = (await c.req.parseBody({ all: true })) as Record<string, unknown>;
  } catch {
    throw new VaultError(400, "Invalid multipart body");
  }
  const one = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
  const source = one(form.source);
  if (!isImportSource(source)) throw new VaultError(400, 'Field "source" must be notion, evernote or obsidian', "importBadSource");
  const folderRaw = typeof one(form.folder) === "string" ? String(one(form.folder)) : IMPORT_FOLDER_DEFAULT;
  const problem = folderError(folderRaw);
  if (problem !== null) throw new VaultError(400, `Field "folder" is not a usable vault folder (${problem})`, "importBadFolder");
  const list = (v: unknown): File[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]).filter((f): f is File => f instanceof File);
  const single = list(form.file);
  const many = list(form.files);
  const paths = (Array.isArray(form.paths) ? form.paths : form.paths === undefined ? [] : [form.paths]).map(String);
  const size = [...single, ...many].reduce((n, f) => n + f.size, 0);
  if (size > NOTES_IMPORT_MAX_BYTES) throw new VaultError(413, `The export is larger than ${NOTES_IMPORT_MAX_BYTES} bytes`, "importTooBig");
  let files: ExportFile[];
  if (single.length === 1) {
    const f = single[0];
    const bytes = new Uint8Array(await f.arrayBuffer());
    const ext = extensionOf(f.name);
    if (ext === "zip") files = unzipExport(bytes);
    else if (ext === "enex") files = [{ path: f.name, bytes }];
    else throw new VaultError(400, "Import takes a .zip, an .enex, or a folder's files", "importUnknownType");
  } else if (many.length > 0) {
    files = [];
    for (let i = 0; i < many.length; i++) {
      const rel = (paths[i] || many[i].name).replace(/\\/g, "/").replace(/^\/+/, "");
      if (rel.split("/").includes("..")) throw new VaultError(400, "A file path climbs out of the folder", "importBadPath");
      files.push({ path: rel, bytes: new Uint8Array(await many[i].arrayBuffer()) });
    }
    files = dropCommonRoot(files);
  } else {
    throw new VaultError(400, 'Multipart field "file" or "files" is required', "importNoFile");
  }
  return c.json(planImport(source, files, folderRaw.trim() === "" ? "" : folderRaw));
});

importRoutes.post("/import/commit", async (c) => {
  adminOnly(c);
  const planId = await jsonField(c, "planId");
  c.header("Content-Type", "application/x-ndjson; charset=utf-8");
  c.header("Cache-Control", "no-store");
  return stream(c, async (s) => {
    try {
      await commitImport(planId, (p) => {
        void s.write(`${JSON.stringify(p)}\n`);
      });
    } catch (err) {
      const code = err instanceof VaultError ? err.code : undefined;
      await s.write(`${JSON.stringify({ type: "error", error: err instanceof Error ? err.message : String(err), ...(code ? { code } : {}) })}\n`);
    }
  });
});

importRoutes.post("/import/undo", async (c) => {
  adminOnly(c);
  return c.json(await undoImport(await jsonField(c, "undoId")));
});
