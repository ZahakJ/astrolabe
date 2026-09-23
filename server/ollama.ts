// OLLAMA, OVER ITS OWN HTTP API — the local half of Ask the vault
// (docs/ask.md). Three calls and nothing else: list the pulled models, embed
// a batch of texts, stream a chat. No client library: the API is three JSON
// endpoints, and the product has no other reason to carry a dependency.
//
// Every call reads the address fresh (askSettings.ts ollamaUrl, from
// OLLAMA_HOST), so a test can stand a fake server up and point the module at
// it, and nothing here keeps a connection or a cache of its own.

import { ollamaUrl } from "./askSettings.ts";

/** Ollama is down, or not installed, or somewhere else — one error for all
 *  three, because the panel says the same sentence for each. */
export class OllamaDown extends Error {
  constructor(cause: unknown) {
    super(`Ollama is not answering at ${ollamaUrl()}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "OllamaDown";
  }
}

/** Ollama answered, with an error of its own (a model that is not pulled is
 *  a 404 whose body says so). */
export class OllamaError extends Error {
  readonly status: number;
  constructor(status: number, body: string) {
    super(`Ollama answered ${status}: ${body.slice(0, 300)}`);
    this.name = "OllamaError";
    this.status = status;
  }
}

async function call(path: string, init: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const signals = [AbortSignal.timeout(init.timeoutMs ?? 120_000)];
  if (init.signal) signals.push(init.signal);
  let res: Response;
  try {
    res = await fetch(`${ollamaUrl()}${path}`, { ...init, signal: AbortSignal.any(signals) });
  } catch (err) {
    if (init.signal?.aborted) throw err;
    throw new OllamaDown(err);
  }
  if (!res.ok) throw new OllamaError(res.status, await res.text().catch(() => ""));
  return res;
}

/** The names of the pulled models (`name:tag`). */
export async function ollamaModels(timeoutMs = 3_000): Promise<string[]> {
  const res = await call("/api/tags", { method: "GET", timeoutMs });
  const body = (await res.json()) as { models?: { name?: unknown; model?: unknown }[] };
  const out: string[] = [];
  for (const m of body.models ?? []) {
    if (typeof m.name === "string") out.push(m.name);
    else if (typeof m.model === "string") out.push(m.model);
  }
  return out;
}

/** Whether `model` is among the pulled names. `name` means `name:latest`,
 *  and the comparison ignores case, the way Ollama's own resolution does. */
export function hasModel(pulled: readonly string[], model: string): boolean {
  const want = (model.includes(":") ? model : `${model}:latest`).toLowerCase();
  return pulled.some((p) => (p.includes(":") ? p : `${p}:latest`).toLowerCase() === want);
}

/** Embed a batch. One vector per input, in order. */
export async function ollamaEmbed(model: string, input: string[], signal?: AbortSignal): Promise<number[][]> {
  const res = await call("/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // truncate: a chunk is cut to ≤400 estimated tokens, but an estimate is
    // an estimate; a model with a short window truncates rather than 400s.
    body: JSON.stringify({ model, input, truncate: true }),
    signal,
    timeoutMs: 300_000,
  });
  const body = (await res.json()) as { embeddings?: unknown };
  if (!Array.isArray(body.embeddings) || body.embeddings.length !== input.length) {
    throw new OllamaError(502, "embed answered without one vector per input");
  }
  return body.embeddings as number[][];
}

/** Stream a chat answer. `onDelta` receives the text as it arrives; the
 *  promise resolves when the model is done. Thinking is off: the answer is
 *  grounded in the excerpts it is handed, and a reasoning model's minute of
 *  thought before the first word is the wrong trade for a side panel. */
export async function ollamaChat(
  model: string,
  system: string,
  user: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await call("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      think: false,
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal,
    timeoutMs: 600_000,
  });
  if (!res.body) throw new OllamaError(502, "chat answered with no body");
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
      if (line === "") continue;
      const frame = JSON.parse(line) as { message?: { content?: unknown }; error?: unknown; done?: boolean };
      if (typeof frame.error === "string") throw new OllamaError(500, frame.error);
      const text = frame.message?.content;
      if (typeof text === "string" && text !== "") onDelta(text);
    }
  }
}
