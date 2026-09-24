// The client's side of webmentions and the fediverse (docs/webmentions.md):
// three requests, each answered by server/webmentionRoutes.ts.

import type { CommentData, FederationStatus } from "../../shared/types.ts";
import { withPreview } from "../api.ts";

/** What other sites said about one note — approved ones for a visitor. An
 *  empty list when the feature is off or the note is not public. */
export async function fetchMentions(path: string): Promise<CommentData[]> {
  const res = await fetch(`/api/webmentions?path=${encodeURIComponent(path)}`, withPreview());
  if (!res.ok) return [];
  return (await res.json()) as CommentData[];
}

/** The Publishing tab's panels: the Sent list, the address, the followers. */
export async function fetchFederationStatus(): Promise<FederationStatus> {
  const res = await fetch("/api/webmentions/status");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as FederationStatus;
}

export type VerifyOutcome = "filed" | "updated" | "withdrawn" | "dropped" | "unreachable";

/** "Verify again": the source fetched now; kept, refreshed or withdrawn. */
export async function verifyMention(id: number): Promise<VerifyOutcome> {
  const res = await fetch(`/api/webmentions/${id}/verify`, { method: "POST" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { outcome: VerifyOutcome }).outcome;
}

/** An address from another site, only when it is one a link may carry. */
export function safeHref(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** `other.example/posts/1` — an address as a reader recognises it. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const tail = `${u.pathname}${u.search}`.replace(/\/$/, "");
    return `${u.host}${tail.length > 32 ? `${tail.slice(0, 31)}…` : tail}`;
  } catch {
    return url;
  }
}
