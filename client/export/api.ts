// The export route's client half — here, in the dialog's lazy chunk, and
// not in client/api.ts, which is in everybody's entry: a visitor reading a
// blog post must not download the URL builder for a dialog they can never
// open. The one thing borrowed from api.ts is `ApiError`, so a refusal
// surfaces to the dialog the way every other route's does.

import { ApiError, REQUEST_TIMEOUT_MS, requestSignal } from "../api.ts";
import type { ExportLinkStyle, ExportScope, ExportSummary } from "../../shared/types.ts";

export interface ExportParams {
  scope: ExportScope;
  /** The note or folder path, or the tag; ignored for the vault. */
  target: string;
  links: ExportLinkStyle;
  attachments: boolean;
}

/** The download URL for `GET /api/export`. A URL rather than a fetcher on
 *  purpose: the archive is handed to an `<a download>` so the browser's own
 *  download manager carries the progress and the cookie carries the session
 *  — a `fetch` into a Blob would hold a 2 GB vault in memory first. */
export function exportUrl(params: ExportParams): string {
  const q = new URLSearchParams({ scope: params.scope, links: params.links, attachments: params.attachments ? "1" : "0" });
  if (params.scope !== "vault") q.set("target", params.target);
  return `/api/export?${q.toString()}`;
}

/** The dry run of the same query: counts and size, or the server's refusal
 *  as an `ApiError` carrying `exportEmpty` / `exportTooLarge`. Sent as the
 *  real admin session, never under the visitor-preview header — the palette
 *  does not offer the dialog in preview, and the route would 401. */
export async function exportSummary(params: ExportParams, signal?: AbortSignal): Promise<ExportSummary> {
  const res = await fetch(`${exportUrl(params)}&dry=1`, { signal: requestSignal(signal ?? null, REQUEST_TIMEOUT_MS) });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* a non-JSON body is handled by the status below */
  }
  const field = (name: string): string | undefined =>
    body !== null && typeof body === "object" && typeof (body as Record<string, unknown>)[name] === "string"
      ? ((body as Record<string, unknown>)[name] as string)
      : undefined;
  if (!res.ok) throw new ApiError(field("error") ?? `HTTP ${res.status}`, res.status, field("code"));
  if (body === null || typeof body !== "object") throw new ApiError("The server answered with a page, not data", res.status, "notJson");
  return body as ExportSummary;
}
