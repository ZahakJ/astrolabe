// POST /api/orbits/import — an Anki .apkg or a CSV/TSV, as notes.
//
// Mounted under /api/orbits from server/api.ts, BELOW the auth
// guard, so a visitor and an admin wearing the preview header are already
// 401 here: an import writes notes and copies media into the vault, which
// is the owner's to do and nobody else's. The rest of the deck
// routes are api.ts's own; this one sits apart because it is the only one
// that takes a file, and the only one whose body cap is the import's.
//
// Multipart, like /api/upload, and parsed the same way (`c.req.parseBody`
// buffers the file; the body cap in api.ts bounds what it buffers):
//
//   file    the .apkg, .csv or .tsv (required)
//   folder  vault-relative folder for the notes; "Orbits" by default
//   title   CSV only: the note's title (the file's name otherwise)
//   front, back, extra, tags
//           CSV only: 0-based column indexes (defaults 0, 1, 2 if present, none)
//   header  CSV only: "1" the first row names the columns, "0" it is a
//           card; unset, the importer looks at the row and decides
//
// Answers {created: [paths], cards, skipped: [{reason, count}]}; `cards`
// counts stars (a `:::` pair is two), and the reasons are keys
// (`suspended`, `empty`, `frontTooLong`, `extraTemplates`, `unreadable`,
// `mediaUnsupported`, `mediaMissing`) so the client can say them in the
// reader's language. A Node without node:sqlite answers 501 with the code
// `deckImportNoSqlite`, and one without zstd (a recent Anki's export)
// `deckImportNoZstd`.

import { Hono } from "hono";
import { normalizeFolder, folderError } from "../shared/attachments.ts";
import { DECK_IMPORT_MAX_BYTES } from "../shared/limits.ts";
import { importFile, type ImportResult } from "./deckImport.ts";
import { VaultError } from "./vault.ts";

export const deckImportRoutes = new Hono();

function column(form: Record<string, unknown>, key: string, fallback: number | null): number | null {
  const raw = form[key];
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 200) throw new VaultError(400, `Field "${key}" must be a column index`);
  return n;
}

deckImportRoutes.post("/import", async (c) => {
  let form: Record<string, unknown>;
  try {
    form = await c.req.parseBody();
  } catch {
    throw new VaultError(400, "Invalid multipart body");
  }
  const file = form.file;
  if (!(file instanceof File)) throw new VaultError(400, 'Multipart field "file" (the deck) is required');
  if (file.size > DECK_IMPORT_MAX_BYTES) throw new VaultError(413, `File too large (${DECK_IMPORT_MAX_BYTES} bytes max)`);
  const folderRaw = typeof form.folder === "string" ? form.folder : "";
  const problem = folderError(folderRaw);
  if (problem !== null) throw new VaultError(400, `Field "folder" is not a usable vault folder (${problem})`);
  const header = form.header === "1" || form.header === "true" ? true : form.header === "0" || form.header === "false" ? false : null;
  const result: ImportResult = await importFile({
    name: typeof file.name === "string" ? file.name : "",
    bytes: new Uint8Array(await file.arrayBuffer()),
    folder: normalizeFolder(folderRaw),
    csv: {
      title: typeof form.title === "string" && form.title.trim() !== "" ? form.title.trim().slice(0, 120) : null,
      front: column(form, "front", 0) ?? 0,
      back: column(form, "back", 1) ?? 1,
      extra: column(form, "extra", 2),
      tags: column(form, "tags", null),
      header,
    },
  });
  return c.json(result);
});
