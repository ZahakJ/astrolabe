// The import wizard's three calls (server/importRoutes.ts, docs/import.md).

import type { ImportPreview, ImportProgress, ImportSourceKind, ImportUndoResult } from "../../shared/importPlan.ts";
import { ApiError, UPLOAD_TIMEOUT_MS, withPreview } from "../api.ts";

async function fail(res: Response): Promise<never> {
  let body: { error?: string; code?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* not JSON */
  }
  throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status, body.code);
}

/** What the wizard sends: one archive, or a picked folder's files with the
 *  path each had inside it. */
export type ImportInput = { kind: "file"; file: File } | { kind: "folder"; files: Array<{ file: File; path: string }> };

export async function previewImport(source: ImportSourceKind, folder: string, input: ImportInput): Promise<ImportPreview> {
  const form = new FormData();
  form.append("source", source);
  form.append("folder", folder);
  if (input.kind === "file") form.append("file", input.file, input.file.name);
  else
    for (const { file, path } of input.files) {
      form.append("files", file, file.name);
      form.append("paths", path);
    }
  const res = await fetch("/api/import/preview", withPreview({ method: "POST", body: form, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) }));
  if (!res.ok) return fail(res);
  return (await res.json()) as ImportPreview;
}

/** Commit a plan, hearing each line of the streamed answer as it lands.
 *  Resolves to the last line (`done`), or throws the `error` line's words. */
export async function commitImport(planId: string, onLine: (line: ImportProgress) => void): Promise<Extract<ImportProgress, { type: "done" }>> {
  const res = await fetch("/api/import/commit", withPreview({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) }));
  if (!res.ok || !res.body) return fail(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last: ImportProgress | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf("\n");
    while (nl !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line !== "") {
        last = JSON.parse(line) as ImportProgress;
        onLine(last);
      }
      nl = buffer.indexOf("\n");
    }
    if (done) break;
  }
  if (last?.type === "error") throw new ApiError(last.error, 500);
  if (last?.type !== "done") throw new ApiError("The import stopped before it finished", 500);
  return last;
}

export async function undoImport(undoId: string): Promise<ImportUndoResult> {
  const res = await fetch("/api/import/undo", withPreview({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ undoId }) }));
  if (!res.ok) return fail(res);
  return (await res.json()) as ImportUndoResult;
}
