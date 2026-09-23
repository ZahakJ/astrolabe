// ASK THE VAULT — the routes and the wiring (docs/ask.md).
//
// Four doors over one index (server/embeddings.ts):
//
//   GET  /api/semantic?q=            meaning search: the best passage per note
//   GET  /api/semantic/related?path= the notes nearest the open one
//   GET  /api/semantic/suggest?path= passages elsewhere, close and not linked
//   POST /api/ask {question}         an answer, streamed as NDJSON, grounded
//                                    ONLY in the top-k passages, with sources
//
// plus `GET /api/ask/status` (what every door checks before offering itself)
// and `POST /api/ask/reindex`.
//
// EVERY ROUTE IS ADMIN-ONLY — a 401 to a visitor and to an admin previewing
// as one. The index reads every note's body, published or not; a meaning
// search, a related list or an answer served to a visitor would be an oracle
// for the notes the owner did not publish. Nothing here reaches the public
// site, and the public shell never asks.
//
// OLLAMA ABSENT OR DOWN is an ordinary state, not a fault: each door answers
// 503 with a stable `code` (`ollamaDown`, `noEmbedModel`), the client says so
// in one line, and the exact search (minisearch, /api/search) is untouched —
// it never depended on any of this.

import { Hono, type Context } from "hono";
import path from "node:path";
import type { AskEvent, AskErrorCode, AskSourceWire, AskStatus, LinkSuggestion, SemanticHit, SemanticResponse } from "../shared/types.ts";
import { ASK_SYSTEM, buildAskPrompt, citationLink, embedPrefixes, normalize, type AskSource } from "../shared/semantic.ts";
import { isNotePath } from "../shared/noteFormat.ts";
import { anthropicChat } from "./anthropic.ts";
import { askEffective } from "./askSettings.ts";
import { isPublishLimited } from "./auth.ts";
import { SemanticIndex } from "./embeddings.ts";
import { isTemplateNote, linkSpellingFor, nearbySources, notesLinkedFrom, notesLinkingTo, whenIndexed } from "./indexer.ts";
import { hasModel, ollamaChat, ollamaEmbed, ollamaModels, OllamaDown, OllamaError } from "./ollama.ts";
import { dataDir } from "./site.ts";
import { onEvent, readNote, VaultError } from "./vault.ts";

let index: SemanticIndex | null = null;
let timer: NodeJS.Timeout | null = null;

/** Quiet time after the last vault event before a pass starts: a save is
 *  one event, a `git pull` is hundreds, and both should be one pass. */
const SETTLE_MS = 1_500;
/** When Ollama was down or the model missing, try again after this. */
const RETRY_MS = 60_000;

function schedule(ms = SETTLE_MS): void {
  if (index === null) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void (async () => {
      // The event fired before the note index applied it; read the index
      // only once it has (the graphCache.ts lesson).
      await whenIndexed();
      if (index === null) return;
      const before = index.embedded;
      const t0 = performance.now();
      await index.refresh();
      const made = index.embedded - before;
      // One line per pass that did work — the first one after boot is the
      // cold index's cost, and the number docs/ask.md quotes.
      if (made > 0) console.log(`  ask: embedded ${made} passages in ${Math.round(performance.now() - t0)}ms (${index.counts().chunks} in the index)`);
      if (index.lastError) schedule(RETRY_MS);
    })();
  }, ms);
  timer.unref?.();
}

/** Start the index over the vault: open the store, subscribe to the watcher,
 *  and book the first pass. Nothing is awaited — boot does not wait for a
 *  single vector. */
export function initAsk(dbFile: string | null = path.join(dataDir(), "embeddings.db")): void {
  index = new SemanticIndex({
    dbFile,
    sources: () =>
      nearbySources()
        .notes.filter((n) => !isTemplateNote(n.path))
        .map((n) => ({ path: n.path, title: n.title, mtimeMs: n.mtimeMs })),
    // A LaTeX note is embedded from the prose the index already extracted:
    // its source is macros, and a heading there is `\section{…}`.
    read: async (p) => {
      if (/\.md$/i.test(p) || !isNotePath(p)) return (await readNote(p)).content;
      return nearbySources().notes.find((n) => n.path === p)?.prose() ?? "";
    },
    model: () => askEffective().embedModel,
    embed: (model, inputs) => ollamaEmbed(model, inputs),
  });
  onEvent(() => schedule());
  schedule(500);
}

/** For the tests and the perf harness. */
export function askIndex(): SemanticIndex | null {
  return index;
}

// ── The question's vector ───────────────────────────────────────────────────

const queryCache = new Map<string, Float32Array>();
const QUERY_CACHE_MAX = 64;

async function embedQuery(text: string): Promise<Float32Array> {
  const model = askEffective().embedModel;
  const key = `${model}\0${text}`;
  const hit = queryCache.get(key);
  if (hit) return hit;
  const [vec] = await ollamaEmbed(model, [embedPrefixes(model).query + text]);
  const out = normalize(Float32Array.from(vec));
  queryCache.set(key, out);
  if (queryCache.size > QUERY_CACHE_MAX) queryCache.delete(queryCache.keys().next().value as string);
  return out;
}

// ── Status ──────────────────────────────────────────────────────────────────

let pulled: { at: number; names: string[] | null } = { at: 0, names: null };

/** The pulled models, cached for five seconds; null when Ollama is down. */
async function pulledModels(): Promise<string[] | null> {
  if (Date.now() - pulled.at < 5_000) return pulled.names;
  let names: string[] | null;
  try {
    names = await ollamaModels();
  } catch {
    names = null;
  }
  pulled = { at: Date.now(), names };
  return names;
}

export async function askStatus(): Promise<AskStatus> {
  const eff = askEffective();
  const names = await pulledModels();
  const counts = index?.counts() ?? { notes: 0, indexedNotes: 0, chunks: 0, pending: 0 };
  // The model setting may have changed since the last pass; a status read is
  // the panel looking, so bring the index along.
  if (names !== null && counts.pending > 0 && timer === null) schedule(0);
  const remote = eff.provider === "anthropic";
  return {
    ollama: names !== null,
    embedModel: eff.embedModel,
    embedModelReady: names !== null && hasModel(names, eff.embedModel),
    provider: eff.provider,
    chatModel: remote ? eff.anthropicModel : eff.chatModel,
    chatReady: remote ? eff.keySet : names !== null && hasModel(names, eff.chatModel),
    remote,
    ...counts,
    error: index?.lastError ?? null,
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────

function adminOnly(c: Context): void {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
}

/** Why a door cannot answer, as the stable code the client translates. */
async function unavailable(): Promise<AskErrorCode | null> {
  const names = await pulledModels();
  if (names === null) return "ollamaDown";
  if (!hasModel(names, askEffective().embedModel)) return "noEmbedModel";
  return null;
}

function hitOf(note: { path: string; title: string }, chunk: { heading: string | null; headingLine: number; text: string }, score: number): SemanticHit {
  return {
    path: note.path,
    title: note.title,
    heading: chunk.heading,
    line: chunk.headingLine,
    text: chunk.text.length > 320 ? `${chunk.text.slice(0, 317).trimEnd()}…` : chunk.text,
    score: Math.round(score * 1000) / 1000,
  };
}

/** Embedding failures map onto the two stable codes; anything else is a
 *  real fault and propagates. */
function codeOf(err: unknown): AskErrorCode | null {
  if (err instanceof OllamaDown) return "ollamaDown";
  if (err instanceof OllamaError && err.status === 404) return "noEmbedModel";
  return null;
}

export const askRoutes = new Hono();

askRoutes.get("/ask/status", async (c) => {
  adminOnly(c);
  return c.json(await askStatus());
});

askRoutes.post("/ask/reindex", async (c) => {
  adminOnly(c);
  pulled.at = 0;
  schedule(0);
  return c.json(await askStatus());
});

askRoutes.get("/semantic", async (c) => {
  adminOnly(c);
  const q = (c.req.query("q") ?? "").trim().slice(0, 500);
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 20, 1), 50);
  if (q === "" || index === null) return c.json({ hits: [], pending: 0 } satisfies SemanticResponse);
  let qv: Float32Array;
  try {
    qv = await embedQuery(q);
  } catch (err) {
    const code = codeOf(err) ?? (await unavailable());
    if (code) return c.json({ error: "Meaning search is unavailable", code }, 503);
    throw err;
  }
  const hits = index.searchVector(qv, limit).map(({ note, chunk, score }) => hitOf(note, chunk, score));
  return c.json({ hits, pending: index.counts().pending } satisfies SemanticResponse);
});

askRoutes.get("/semantic/related", async (c) => {
  adminOnly(c);
  const p = c.req.query("path") ?? "";
  if (index === null || p === "") return c.json([]);
  const code = await unavailable();
  if (code) return c.json({ error: "Related notes are unavailable", code }, 503);
  const out: SemanticHit[] = index.related(p, 8).map(({ note, score }) => ({
    path: note.path,
    title: note.title,
    heading: null,
    line: 1,
    text: "",
    score: Math.round(score * 1000) / 1000,
  }));
  return c.json(out);
});

askRoutes.get("/semantic/suggest", async (c) => {
  adminOnly(c);
  const p = c.req.query("path") ?? "";
  if (index === null || p === "") return c.json([]);
  const code = await unavailable();
  if (code) return c.json({ error: "Suggestions are unavailable", code }, 503);
  // Linked either way is linked: a note that already points here, or that
  // this note points to, is not a suggestion. Unlinked MENTIONS (the words
  // themselves) are /api/mentions' list, and stay separate.
  const linked = new Set([...notesLinkedFrom(p), ...notesLinkingTo(p)]);
  const out: LinkSuggestion[] = index.suggest(p, 8, linked).map(({ note, chunk, score }) => ({
    ...hitOf(note, chunk, score),
    link: citationLink({ title: note.title, heading: chunk.heading }, linkSpellingFor(note.path)),
  }));
  return c.json(out);
});

askRoutes.post("/ask", async (c) => {
  adminOnly(c);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new VaultError(400, "Expected a JSON body");
  }
  const question = typeof (body as { question?: unknown })?.question === "string" ? (body as { question: string }).question.trim() : "";
  if (question === "") throw new VaultError(400, "A question is required");
  if (question.length > 2_000) throw new VaultError(400, "That question is too long (2000 characters max)");
  const eff = askEffective();
  const remote = eff.provider === "anthropic";
  const model = remote ? eff.anthropicModel : eff.chatModel;
  const abort = new AbortController();
  const enc = new TextEncoder();
  const t0 = performance.now();

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const send = (e: AskEvent): void => controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      const fail = (code: AskErrorCode): void => {
        send({ type: "error", code });
        controller.close();
      };
      try {
        if (index === null || index.counts().chunks - index.counts().pending === 0) {
          const code = await unavailable();
          return fail(code ?? "emptyIndex");
        }
        let qv: Float32Array;
        try {
          qv = await embedQuery(question);
        } catch (err) {
          return fail(codeOf(err) ?? "ollamaDown");
        }
        if (remote && !eff.keySet) return fail("noKey");
        if (!remote) {
          const names = await pulledModels();
          if (names === null) return fail("ollamaDown");
          if (!hasModel(names, eff.chatModel)) return fail("noChatModel");
        }
        const sources: (AskSource & { spelling: string })[] = index.retrieve(qv, eff.topK).map(({ note, chunk, score }, i) => ({
          n: i + 1,
          path: note.path,
          title: note.title,
          heading: chunk.heading,
          line: chunk.headingLine,
          text: chunk.text,
          score: Math.round(score * 1000) / 1000,
          spelling: linkSpellingFor(note.path),
        }));
        send({ type: "sources", sources: sources satisfies AskSourceWire[], model, provider: eff.provider, remote });
        let first: number | null = null;
        const onDelta = (text: string): void => {
          if (first === null) first = performance.now() - t0;
          send({ type: "delta", text });
        };
        const prompt = buildAskPrompt(question, sources);
        try {
          if (remote) await anthropicChat(model, ASK_SYSTEM, prompt, onDelta, abort.signal);
          else await ollamaChat(model, ASK_SYSTEM, prompt, onDelta, abort.signal);
        } catch (err) {
          if (abort.signal.aborted) return;
          console.warn(`astrolabe: ask — ${err instanceof Error ? err.message : String(err)}`);
          return fail(remote ? "anthropicFailed" : err instanceof OllamaDown ? "ollamaDown" : "chatFailed");
        }
        send({ type: "done", ms: Math.round(performance.now() - t0), firstTokenMs: first === null ? null : Math.round(first) });
        controller.close();
      } catch (err) {
        if (abort.signal.aborted) return;
        console.error("astrolabe: ask failed", err);
        try {
          fail("chatFailed");
        } catch {
          /* the reader went away */
        }
      }
    },
    cancel: () => abort.abort(),
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Accel-Buffering": "no",
    },
  });
});
