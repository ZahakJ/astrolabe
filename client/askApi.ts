// Ask the vault — the client's half of the wire (docs/ask.md, server/ask.ts).
//
// Its own module rather than more rows in api.ts, because every caller is a
// lazy surface (the answer panel, the meaning results, the Related and
// Suggest lists): these fetchers ride their chunks, never the first paint.

import type { AskEvent, AskErrorCode, AskStatus, LinkSuggestion, SemanticHit, SemanticResponse } from "../shared/types.ts";
import { ApiError, apiRequest, withPreview } from "./api.ts";
import { t, tf, type I18nKey } from "./i18n.ts";

export function askStatus(signal?: AbortSignal): Promise<AskStatus> {
  return apiRequest<AskStatus>("/api/ask/status", signal ? { signal } : undefined);
}

export function askReindex(): Promise<AskStatus> {
  return apiRequest<AskStatus>("/api/ask/reindex", { method: "POST" });
}

export function semanticSearch(q: string, signal?: AbortSignal): Promise<SemanticResponse> {
  return apiRequest<SemanticResponse>(`/api/semantic?q=${encodeURIComponent(q)}`, signal ? { signal } : undefined);
}

export function relatedNotes(path: string, signal?: AbortSignal): Promise<SemanticHit[]> {
  return apiRequest<SemanticHit[]>(`/api/semantic/related?path=${encodeURIComponent(path)}`, signal ? { signal } : undefined);
}

export function suggestLinks(path: string, signal?: AbortSignal): Promise<LinkSuggestion[]> {
  return apiRequest<LinkSuggestion[]>(`/api/semantic/suggest?path=${encodeURIComponent(path)}`, signal ? { signal } : undefined);
}

/** Ask a question; `onEvent` receives each NDJSON event as it lands. Resolves
 *  when the stream ends. A non-2xx before the stream starts throws ApiError. */
export async function askQuestion(question: string, onEvent: (e: AskEvent) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch(
    "/api/ask",
    withPreview({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }), signal }),
  );
  if (!res.ok || !res.body) {
    let code: string | undefined;
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      code = body.code;
      if (body.error) message = body.error;
    } catch {
      /* not JSON */
    }
    throw new ApiError(message, res.status, code);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      nl = buf.indexOf("\n");
      if (line !== "") onEvent(JSON.parse(line) as AskEvent);
    }
  }
}

const ERROR_KEYS: Record<AskErrorCode, I18nKey> = {
  ollamaDown: "askErrOllamaDown",
  noEmbedModel: "askErrNoEmbedModel",
  noChatModel: "askErrNoChatModel",
  noKey: "askErrNoKey",
  anthropicFailed: "askErrAnthropic",
  chatFailed: "askErrChat",
  emptyIndex: "askErrEmptyIndex",
};

/** The one line a door shows when it cannot answer — from a stable code, in
 *  the reader's language, never the server's English. */
export function askErrorLine(code: string | undefined): string {
  return t(code !== undefined && code in ERROR_KEYS ? ERROR_KEYS[code as AskErrorCode] : "askErrUnavailable");
}

/** The same line for a status read: null when every door can open. */
export function statusLine(s: AskStatus | null): string | null {
  if (s === null) return t("askErrUnavailable");
  if (!s.ollama) return t("askErrOllamaDown");
  if (!s.embedModelReady) return tf("askErrPullModel", { model: s.embedModel });
  return null;
}
