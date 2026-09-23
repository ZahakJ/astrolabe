// THE OPTIONAL REMOTE ANSWERER — Anthropic's Messages API, streamed through
// the server (docs/ask.md). Used only when the owner picks it in Settings →
// Ask and stores a key; the key is read here, server-side, per call
// (askSettings.ts), and never reaches a browser.
//
// Raw HTTP rather than @anthropic-ai/sdk, deliberately: this product carries
// no model SDK for its local path either (server/ollama.ts), the call is one
// POST, and a dependency pulled in for one optional door is weight every
// install pays. The request shape is the documented one — `POST /v1/messages`
// with `x-api-key`, `anthropic-version: 2023-06-01`, and a body of `model`,
// `max_tokens`, `system`, `messages`, `stream: true` — and the stream is
// Server-Sent Events whose `content_block_delta` events carry
// `delta: { type: "text_delta", text }`; an `error` event carries
// `error: { type, message }`. Nothing else is read.

import { anthropicKey, scrubKey } from "./askSettings.ts";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export class AnthropicError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(scrubKey(`Anthropic answered ${status}: ${message}`).slice(0, 400));
    this.name = "AnthropicError";
    this.status = status;
  }
}

/** Stream one answer. Resolves when the stream ends; throws AnthropicError
 *  on an HTTP error or an `error` event mid-stream. */
export async function anthropicChat(
  model: string,
  system: string,
  user: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  url = ANTHROPIC_URL,
): Promise<void> {
  const key = anthropicKey();
  if (key === null) throw new AnthropicError(401, "no key stored");
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: user }],
        stream: true,
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(300_000)]) : AbortSignal.timeout(300_000),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new AnthropicError(0, err instanceof Error ? err.message : String(err));
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: unknown } };
      if (typeof parsed.error?.message === "string") message = parsed.error.message;
    } catch {
      /* not JSON */
    }
    throw new AnthropicError(res.status, message);
  }
  await readAnthropicStream(res.body, onDelta);
}

/** Read a Messages API event stream, handing each text delta to `onDelta`.
 *  Exported for the test that feeds it a recorded stream. */
export async function readAnthropicStream(stream: ReadableStream<Uint8Array>, onDelta: (text: string) => void): Promise<void> {
  const reader = (stream as ReadableStream<BufferSource>).pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    // Events are separated by a blank line; only `data:` lines matter, and
    // every data payload carries its own `type`.
    let cut = buf.indexOf("\n\n");
    while (cut >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      cut = buf.indexOf("\n\n");
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (data === "") continue;
      let event: { type?: string; delta?: { type?: string; text?: unknown }; error?: { type?: string; message?: string } };
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && typeof event.delta.text === "string") {
        onDelta(event.delta.text);
      } else if (event.type === "error") {
        throw new AnthropicError(500, `${event.error?.type ?? "error"}: ${event.error?.message ?? ""}`);
      }
    }
  }
}
