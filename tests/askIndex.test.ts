// The meaning index (server/embeddings.ts), the Ollama client
// (server/ollama.ts) against a FAKE Ollama over real HTTP, and the Anthropic
// stream reader (server/anthropic.ts) against a recorded stream. No model,
// no network: the fakes stand where the services would.

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { SemanticIndex, contentHash } from "../server/embeddings.ts";
import { hasModel, ollamaChat, ollamaEmbed, ollamaModels, OllamaDown, OllamaError } from "../server/ollama.ts";
import { readAnthropicStream } from "../server/anthropic.ts";
import { normalize } from "../shared/semantic.ts";

/** A deterministic 26-dimensional "embedding": letter counts. Passages that
 *  share words point the same way, which is all the ranking tests need. */
function fakeVector(text: string): number[] {
  const v = new Array(26).fill(0);
  for (const ch of text.toLowerCase()) {
    const i = ch.charCodeAt(0) - 97;
    if (i >= 0 && i < 26) v[i]++;
  }
  return v;
}

interface FakeVault {
  files: Map<string, { text: string; mtimeMs: number }>;
  calls: string[][];
  model: string;
  fail: boolean;
}

function makeIndex(dbFile: string | null, vault: FakeVault): SemanticIndex {
  return new SemanticIndex({
    dbFile,
    sources: () => [...vault.files].map(([p, f]) => ({ path: p, title: path.basename(p, ".md"), mtimeMs: f.mtimeMs })),
    read: async (p) => vault.files.get(p)!.text,
    model: () => vault.model,
    embed: async (_model, inputs) => {
      if (vault.fail) throw new Error("connect ECONNREFUSED");
      vault.calls.push(inputs);
      return inputs.map(fakeVector);
    },
  });
}

const embeddedCount = (v: FakeVault): number => v.calls.reduce((n, c) => n + c.length, 0);

describe("the hash-keyed meaning index", () => {
  let dir: string;
  before(() => {
    dir = mkdtempSync(path.join(tmpdir(), "astrolabe-ask-"));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  const vault = (): FakeVault => ({
    files: new Map([
      ["Naps.md", { text: "# Naps\n\nA short nap after lunch.\n\n## Coffee nap\n\nEspresso then sleep.\n", mtimeMs: 1 }],
      ["Olive.md", { text: "# Olive\n\nOlives want sun and little water.\n\n## Pruning\n\nPrune in late winter.\n", mtimeMs: 1 }],
      ["Twin.md", { text: "# Twin\n\nEspresso then sleep.\n", mtimeMs: 1 }],
    ]),
    calls: [],
    model: "fake-embed",
    fail: false,
  });

  it("embeds every passage once, and an unchanged vault never again", async () => {
    const v = vault();
    const idx = makeIndex(path.join(dir, "a.db"), v);
    await idx.refresh();
    assert.equal(embeddedCount(v), 5);
    assert.deepEqual(idx.counts(), { notes: 3, indexedNotes: 3, chunks: 5, pending: 0 });
    await idx.refresh();
    assert.equal(embeddedCount(v), 5);
    idx.close();
  });

  it("re-embeds only the passage that changed when a note is saved", async () => {
    const v = vault();
    const idx = makeIndex(path.join(dir, "b.db"), v);
    await idx.refresh();
    v.calls = [];
    v.files.set("Olive.md", { text: "# Olive\n\nOlives want sun and little water.\n\n## Pruning\n\nPrune in February, before the sap rises.\n", mtimeMs: 2 });
    await idx.refresh();
    assert.equal(v.calls.length, 1);
    assert.deepEqual(v.calls[0], ["Olive › Pruning\n\nPrune in February, before the sap rises."]);
    idx.close();
  });

  it("finds its vectors in the store after a restart and embeds nothing", async () => {
    const v = vault();
    const file = path.join(dir, "c.db");
    const first = makeIndex(file, v);
    await first.refresh();
    first.close();
    v.calls = [];
    const second = makeIndex(file, v);
    await second.refresh();
    assert.equal(embeddedCount(v), 0);
    assert.equal(second.counts().pending, 0);
    assert.equal(second.stored("fake-embed"), 5);
    second.close();
  });

  it("keys by model too: a new embedding model re-embeds, and the old vectors wait for a switch back", async () => {
    const v = vault();
    const idx = makeIndex(path.join(dir, "d.db"), v);
    await idx.refresh();
    v.model = "other-embed";
    v.calls = [];
    await idx.refresh();
    assert.equal(embeddedCount(v), 5);
    v.model = "fake-embed";
    v.calls = [];
    await idx.refresh();
    assert.equal(embeddedCount(v), 0);
    idx.close();
  });

  it("forgets a deleted note, and the prune takes its vectors out of the store", async () => {
    const v = vault();
    const idx = makeIndex(path.join(dir, "e.db"), v);
    await idx.refresh();
    v.files.delete("Olive.md");
    await idx.refresh();
    assert.equal(idx.counts().notes, 2);
    assert.equal(idx.prune(), 2);
    assert.equal(idx.stored("fake-embed"), 3);
    idx.close();
  });

  it("an embedder that is down leaves the passages pending and says why", async () => {
    const v = vault();
    v.fail = true;
    const idx = makeIndex(null, v);
    await idx.refresh();
    assert.equal(idx.counts().pending, 5);
    assert.match(idx.lastError ?? "", /ECONNREFUSED/);
    v.fail = false;
    await idx.refresh();
    assert.equal(idx.counts().pending, 0);
    assert.equal(idx.lastError, null);
  });

  it("the hash is of what the model is shown, so a renamed heading is a new vector", () => {
    assert.notEqual(contentHash("Olive › Pruning\n\nx"), contentHash("Olive › Trimming\n\nx"));
    assert.equal(contentHash("same"), contentHash("same"));
  });

  it("ranks by cosine: search, retrieval, related and suggestions", async () => {
    const v = vault();
    const idx = makeIndex(null, v);
    await idx.refresh();
    const q = normalize(Float32Array.from(fakeVector("prune winter")));
    const hits = idx.searchVector(q, 2);
    assert.equal(hits[0].note.path, "Olive.md");
    assert.equal(hits[0].chunk.heading, "Pruning");
    const got = idx.retrieve(q, 3, 1);
    assert.equal(new Set(got.map((g) => g.note.path)).size, got.length); // one passage per note
    assert.equal(idx.related("Naps.md", 1)[0].note.path, "Twin.md");
    // Twin says what Naps says; once they are linked it is not a suggestion.
    assert.equal(idx.suggest("Naps.md", 1, new Set())[0].note.path, "Twin.md");
    assert.notEqual(idx.suggest("Naps.md", 1, new Set(["Twin.md"]))[0]?.note.path, "Twin.md");
  });
});

describe("Ollama, over its HTTP API (a fake one)", () => {
  let server: Server;
  let saved: string | undefined;
  const seen: { path: string; body: unknown }[] = [];
  before(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = raw ? JSON.parse(raw) : null;
        seen.push({ path: req.url ?? "", body });
        if (req.url === "/api/tags") {
          res.end(JSON.stringify({ models: [{ name: "embeddinggemma:latest" }, { name: "qwen3.5:9b" }] }));
        } else if (req.url === "/api/embed") {
          if (body.model !== "embeddinggemma") {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: `model "${body.model}" not found, try pulling it first` }));
            return;
          }
          res.end(JSON.stringify({ embeddings: body.input.map(fakeVector) }));
        } else if (req.url === "/api/chat") {
          res.setHeader("Content-Type", "application/x-ndjson");
          for (const piece of ["The vault ", "says [1]", "."]) res.write(`${JSON.stringify({ message: { role: "assistant", content: piece }, done: false })}\n`);
          res.end(`${JSON.stringify({ message: { role: "assistant", content: "" }, done: true })}\n`);
        } else {
          res.statusCode = 404;
          res.end("{}");
        }
      });
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    saved = process.env.OLLAMA_HOST;
    const addr = server.address();
    process.env.OLLAMA_HOST = typeof addr === "object" && addr ? `127.0.0.1:${addr.port}` : "";
  });
  after(async () => {
    if (saved === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = saved;
    await new Promise<void>((ok) => server.close(() => ok()));
  });

  it("lists the pulled models, and `name` means `name:latest`", async () => {
    const names = await ollamaModels();
    assert.ok(hasModel(names, "embeddinggemma"));
    assert.ok(hasModel(names, "qwen3.5:9b"));
    assert.ok(!hasModel(names, "bge-m3"));
  });

  it("embeds a batch, one vector per input, asking the model to truncate", async () => {
    const out = await ollamaEmbed("embeddinggemma", ["abc", "zz"]);
    assert.equal(out.length, 2);
    assert.equal(out[1][25], 2);
    const call = seen.find((s) => s.path === "/api/embed") as { body: { truncate: boolean } };
    assert.equal(call.body.truncate, true);
  });

  it("a model that is not pulled is an OllamaError 404, which the routes name noEmbedModel", async () => {
    await assert.rejects(ollamaEmbed("bge-m3", ["x"]), (e: unknown) => e instanceof OllamaError && e.status === 404);
  });

  it("streams a chat answer with thinking off", async () => {
    let text = "";
    await ollamaChat("qwen3.5:9b", "system", "user", (t) => (text += t));
    assert.equal(text, "The vault says [1].");
    const call = seen.find((s) => s.path === "/api/chat") as { body: { think: boolean; stream: boolean; messages: { role: string }[] } };
    assert.equal(call.body.think, false);
    assert.equal(call.body.stream, true);
    assert.deepEqual(call.body.messages.map((m) => m.role), ["system", "user"]);
  });

  it("nobody listening is OllamaDown, the one sentence every door says", async () => {
    const was = process.env.OLLAMA_HOST;
    process.env.OLLAMA_HOST = "127.0.0.1:9"; // discard port: nothing answers
    try {
      await assert.rejects(ollamaModels(1_000), (e: unknown) => e instanceof OllamaDown);
    } finally {
      process.env.OLLAMA_HOST = was;
    }
  });
});

describe("the Anthropic stream", () => {
  const stream = (text: string): ReadableStream<Uint8Array> =>
    new ReadableStream({
      start(c) {
        // Split mid-event, as a network does.
        const bytes = new TextEncoder().encode(text);
        c.enqueue(bytes.slice(0, 37));
        c.enqueue(bytes.slice(37));
        c.close();
      },
    });

  it("hands on text deltas and nothing else", async () => {
    const recorded = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1"}}',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":""}}',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Olives "}}',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"fruit [2]."}}',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
      'event: message_stop\ndata: {"type":"message_stop"}',
      "",
    ].join("\n\n");
    let out = "";
    await readAnthropicStream(stream(recorded), (t) => (out += t));
    assert.equal(out, "Olives fruit [2].");
  });

  it("an error event mid-stream is an error", async () => {
    const recorded = 'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n';
    await assert.rejects(readAnthropicStream(stream(recorded), () => {}), /overloaded_error/);
  });
});
