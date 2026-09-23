// ASK THE VAULT — its settings, and the one secret it may hold (docs/ask.md).
//
// `settings.ask` lives in settings.json, so it travels with the vault like
// every other instance setting (server/configMirror.ts): which models answer
// and embed is a fact about how the owner uses the vault, and a second
// machine should ask the same models.
//
// THE ANTHROPIC KEY DOES NOT TRAVEL, and it is written the way the git token
// is (server/gitSync.ts): write-only through `PATCH /api/settings
// {anthropicKey}`, stored in ASTROLABE_DATA/ask-credentials.json at 0600,
// never mirrored into `.astrolabe/` (a vault is synced, often to a git
// remote), never returned by any read — `effective.ask.keySet` is the only
// thing said about it. A key is a device's.
//
// This module and settings.ts import each other; the pair is inert (functions
// only, nothing called at module top level), the gitSync.ts arrangement.

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import type { AskEffective, AskProvider, AskSettings } from "../shared/types.ts";
import { envRead } from "../shared/envName.ts";
import { getSettings } from "./settings.ts";
import { dataDir } from "./site.ts";
import { VaultError } from "./vault.ts";

export const ASK_DEFAULTS = {
  provider: "ollama" as AskProvider,
  chatModel: "qwen3.5:9b",
  anthropicModel: "claude-sonnet-5",
  // Measured on a bilingual sample (docs/ask.md, "Choosing the embedding
  // model"): all-minilm found 0 of 12 Arabic paraphrases first; this found 9,
  // and the Arabic twin of an English note in the top three for 12 of 12.
  embedModel: "embeddinggemma",
  topK: 6,
};
export const TOP_K_MIN = 2;
export const TOP_K_MAX = 12;
const MODEL_MAX = 120;
const KEY_MAX = 300;
const CREDENTIALS_FILE = "ask-credentials.json";

/** A model name as Ollama or Anthropic spells one: `name[:tag]`, a namespace
 *  allowed, nothing that could be a path or a flag. */
function isModelName(value: string): boolean {
  return value.length <= MODEL_MAX && /^[A-Za-z0-9][\w.\-/:]*$/.test(value) && !value.includes("..");
}

/** settings.json → the stored shape. A malformed sub-key reads as absent. */
export function readAskSettings(raw: unknown): AskSettings | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: AskSettings = {};
  if (r.provider === "ollama" || r.provider === "anthropic") out.provider = r.provider;
  for (const key of ["chatModel", "anthropicModel", "embedModel"] as const) {
    const v = r[key];
    if (typeof v === "string" && isModelName(v.trim())) out[key] = v.trim();
  }
  if (typeof r.topK === "number" && Number.isInteger(r.topK) && r.topK >= TOP_K_MIN && r.topK <= TOP_K_MAX) out.topK = r.topK;
  return Object.keys(out).length > 0 ? out : null;
}

/** PATCH `ask` → the next stored value (null = delete the key). Strict: an
 *  unknown provider or a malformed model name rejects the whole patch. A
 *  sub-key set to null, "" or its default is cleared, so the file only ever
 *  holds what differs from the defaults. */
export function cleanAskPatch(value: unknown, current: unknown): AskSettings | null {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new VaultError(400, 'Settings key "ask" must be an object or null');
  }
  const next: Record<string, unknown> = { ...(readAskSettings(current) ?? {}) };
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key === "provider") {
      if (v === null || v === "") delete next.provider;
      else if (v !== "ollama" && v !== "anthropic") throw new VaultError(400, 'Settings key "ask.provider" must be "ollama" or "anthropic"');
      else if (v === ASK_DEFAULTS.provider) delete next.provider;
      else next.provider = v;
    } else if (key === "chatModel" || key === "anthropicModel" || key === "embedModel") {
      if (v === null || (typeof v === "string" && v.trim() === "")) {
        delete next[key];
        continue;
      }
      if (typeof v !== "string" || !isModelName(v.trim())) {
        throw new VaultError(400, `Settings key "ask.${key}" must be a model name like qwen3.5:9b`);
      }
      if (v.trim() === ASK_DEFAULTS[key]) delete next[key];
      else next[key] = v.trim();
    } else if (key === "topK") {
      if (v === null) {
        delete next.topK;
        continue;
      }
      if (typeof v !== "number" || !Number.isInteger(v) || v < TOP_K_MIN || v > TOP_K_MAX) {
        throw new VaultError(400, `Settings key "ask.topK" must be a whole number from ${TOP_K_MIN} to ${TOP_K_MAX}`);
      }
      if (v === ASK_DEFAULTS.topK) delete next.topK;
      else next.topK = v;
    } else {
      throw new VaultError(400, `Unknown settings key: ask.${key}`);
    }
  }
  return Object.keys(next).length > 0 ? (next as AskSettings) : null;
}

/** Where Ollama is: OLLAMA_HOST (Ollama's own variable, so a machine that
 *  already moved it needs nothing new), else the loopback default. A bare
 *  `host:port` gets its scheme. */
export function ollamaUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = envRead(env, "OLLAMA_HOST")?.trim() || "";
  if (raw === "") return "http://127.0.0.1:11434";
  const withScheme = /^https?:\/\//.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/\/+$/, "").replace("://0.0.0.0", "://127.0.0.1");
}

/** The settings in force, every default filled in. */
export function askEffective(): AskEffective {
  const s = getSettings().ask ?? {};
  return {
    provider: s.provider ?? ASK_DEFAULTS.provider,
    chatModel: s.chatModel ?? ASK_DEFAULTS.chatModel,
    anthropicModel: s.anthropicModel ?? ASK_DEFAULTS.anthropicModel,
    embedModel: s.embedModel ?? ASK_DEFAULTS.embedModel,
    topK: s.topK ?? ASK_DEFAULTS.topK,
    keySet: anthropicKey() !== null,
    ollamaUrl: ollamaUrl(),
  };
}

// ── The key ─────────────────────────────────────────────────────────────────

function credentialsPath(): string {
  return path.join(dataDir(), CREDENTIALS_FILE);
}

/** The stored key, read fresh each time (tiny, and never cached where a
 *  stale read or a heap dump could surface it). */
export function anthropicKey(): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(credentialsPath(), "utf8"));
    const key = (parsed as { anthropicKey?: unknown } | null)?.anthropicKey;
    return typeof key === "string" && key !== "" ? key : null;
  } catch {
    return null;
  }
}

/** A patch validates first and writes after the whole patch is accepted —
 *  settings.ts calls stage, then apply once settings.json has been written. */
let staged: { value: string | null } | null = null;

export function discardStagedAskKey(): void {
  staged = null;
}

/** PATCH anthropicKey: write-only. "" / null clears it. */
export function stageAnthropicKey(value: unknown): void {
  if (value === null || value === "") {
    staged = { value: null };
    return;
  }
  if (typeof value !== "string") throw new VaultError(400, 'Settings key "anthropicKey" must be a string or null');
  const key = value.trim();
  if (key.length > KEY_MAX) throw new VaultError(400, `Settings key "anthropicKey" is too long (${KEY_MAX} characters max)`);
  if (/[\s\u{0}-\u{1f}\u{7f}]/u.test(key)) {
    throw new VaultError(400, 'Settings key "anthropicKey" must not contain whitespace or control characters');
  }
  staged = { value: key };
}

export function applyStagedAskKey(): void {
  const item = staged;
  staged = null;
  if (item === null) return;
  const file = credentialsPath();
  if (item.value === null) {
    try {
      rmSync(file);
    } catch {
      /* nothing stored */
    }
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ anthropicKey: item.value })}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}

/** Redact the key from text that may reach a log or a client. */
export function scrubKey(text: string): string {
  const key = anthropicKey();
  let out = key ? text.split(key).join("[key]") : text;
  out = out.replace(/sk-ant-[\w-]+/g, "[key]");
  return out;
}
