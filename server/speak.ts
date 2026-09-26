// READ ALOUD — the door (docs/read-aloud.md).
//
//   POST /api/speak            { text, lang?, path?, context?, format? } → audio
//   GET  /api/speak/status     what is installed, the install's progress
//   POST /api/speak/install    { engine } → 202; the Settings row polls status
//   POST /api/speak/voices/rescan   read the voices folder again → status
//
// One sentence per request: the client splits a selection with
// shared/speech.ts's splitSentences and asks for each in turn, prefetching the
// next while this one plays, so a word answers at once and a paragraph starts
// speaking before its last sentence exists.
//
// THE ORDER OF OPERATIONS for a POST:
//   1. The language: the caller's, else shared/speech.ts's detection (script,
//      then the note's own `lang:`, then French, then the site).
//   2. The voice. The owner's external speaker first, for the languages it
//      was given (server/speakExternal.ts; never for a visitor). Else
//      shared/speechVoices.ts `resolveVoice`: a voice picked from the voices
//      folder (server/speakVoices.ts) when its runtime is installed; else the
//      owner's engine where both speak the language (Arabic is always Piper
//      and Japanese always Kokoro); else a found voice of the language.
//      Nothing that speaks it → 409 `speakNotInstalled` naming the engine it
//      needs, and the client reads with the device's own voices instead and
//      SAYS so.
//   3. The cache (server/speakCache.ts): a hit costs a file read.
//   4. The line (server/speakQueue.ts): one synthesis at a time; the same
//      request twice is one job; a request the player abandoned is dropped.
//
// WHO MAY ASK. The owner, for any text. A visitor only when the owner turned
// on "Readers may listen" (Settings → Publishing), only for a published note
// named in `path`, only for words that are IN that note (letters and digits
// in order — a selection of the rendered page, not arbitrary text to turn
// this machine into anybody's speech service), and at most SIXTY syntheses
// per address per ten minutes. A cache hit is free and not counted.

import { Hono, type Context } from "hono";
import {
  closeSentence,
  detectSpeechLang,
  frontmatterLang,
  isSpeakEngine,
  isSpeakLang,
  speakEffective,
  speechTextOfNote,
  SPEAK_MAX_CHARS,
  type SpeakLang,
  type SpeakStatus,
} from "../shared/speech.ts";
import { engineNeededWith, resolveVoice, type ResolvedVoice } from "../shared/speechVoices.ts";
import { FRONTMATTER_RE } from "../shared/noteParse.ts";
import { isNotePath } from "../shared/noteFormat.ts";
import { clientIp, isPublishLimited } from "./auth.ts";
import { isNotePublished } from "./indexer.ts";
import { getSettings, effectiveSettings } from "./settings.ts";
import { createSpeakCache, speakCacheKey, type SpeakCache } from "./speakCache.ts";
import {
  childWarm,
  engineBytes,
  engineDownloaded,
  engineInstalled,
  installEngine,
  installedEngines,
  installState,
  runtimeReady,
  SPEAK_FAKE,
  SpeakError,
  synthesize,
  ttsDir,
  venvDir,
  warmEngine,
  type SpeakJob,
  type Synthesis,
} from "./speakEngine.ts";
import { runExternal } from "./speakExternal.ts";
import { speakLocal } from "./speakLocal.ts";
import { createSpeakQueue, type SpeakQueue } from "./speakQueue.ts";
import { foundVoiceNow, foundVoicesSettled, ownVoicesStatus, rescanVoices, type FoundVoice } from "./speakVoices.ts";
import { normalizeRel, readNote, VaultError } from "./vault.ts";
import path from "node:path";

let cache: SpeakCache | null = null;
let cacheRoot = "";
function speakCache(): SpeakCache {
  // Re-rooted if the data directory moved under us (the tests point several
  // servers' worth of ASTROLABE_DATA at one process).
  const root = path.join(ttsDir(), "cache");
  if (!cache || cacheRoot !== root) {
    cache = createSpeakCache(root);
    cacheRoot = root;
  }
  return cache;
}

const queue: SpeakQueue<Synthesis> = createSpeakQueue<Synthesis>();

// ── Visitors ────────────────────────────────────────────────────────────────

const VISITOR_WINDOW_MS = 10 * 60 * 1000;
const VISITOR_MAX = 60;
const visitorTimes = new Map<string, number[]>();

function visitorLimited(ip: string): boolean {
  const now = Date.now();
  if (visitorTimes.size > 1000) {
    for (const [key, times] of visitorTimes) if (times.every((t) => now - t >= VISITOR_WINDOW_MS)) visitorTimes.delete(key);
  }
  const recent = (visitorTimes.get(ip) ?? []).filter((t) => now - t < VISITOR_WINDOW_MS);
  visitorTimes.set(ip, recent);
  return recent.length >= VISITOR_MAX;
}

function recordVisitor(ip: string): void {
  const times = visitorTimes.get(ip) ?? [];
  times.push(Date.now());
  visitorTimes.set(ip, times);
}

/** Letters and digits, lowercased, in order — what "these words are in that
 *  note" is measured over, so the rendered page's quotes, spacing and
 *  markup never decide it. */
export function foldForMatch(text: string): string {
  return (text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]/gu) ?? []).join("");
}

async function noteSource(rel: string): Promise<string | null> {
  try {
    return (await readNote(rel)).content;
  } catch {
    return null;
  }
}

// ── The routes ──────────────────────────────────────────────────────────────

/** The body, as an object. Its own small reader rather than
 *  server/requestBody.ts, which is a part of api.ts's family
 *  (tests/splits.test.ts) and not a door for the route files that stand
 *  apart, as server/voice.ts does. */
async function jsonBody(c: Context): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await c.req.json();
    if (typeof body === "object" && body !== null && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new VaultError(400, "Invalid JSON body");
}

export const speakRoutes = new Hono();

/** The settings in force: settings.json's, with this machine's own two
 *  (server/speakLocal.ts). */
function speakSettings() {
  return speakEffective(getSettings().speak, speakLocal());
}

function statusBody(): SpeakStatus {
  const settings = speakSettings();
  return {
    runtime: runtimeReady(),
    engines: {
      light: { installed: engineInstalled("light"), downloaded: engineDownloaded("light"), bytes: engineBytes("light") },
      natural: { installed: engineInstalled("natural"), downloaded: engineDownloaded("natural"), bytes: engineBytes("natural") },
    },
    install: installState(),
    warm: childWarm(),
    queued: queue.waiting(),
    venv: venvDir(),
    test: SPEAK_FAKE,
    settings,
    own: ownVoicesStatus(),
  };
}

speakRoutes.get("/speak/status", (c) => {
  const settings = speakSettings();
  if (isPublishLimited(c)) {
    // A visitor learns one thing: whether the blog offers Read aloud.
    return c.json({ public: settings.public && installedEngines().size > 0 });
  }
  // Asking is the first sign somebody is about to listen: load the chosen
  // engine now, so the first word answers warm.
  warmEngine(settings.engine);
  return c.json(statusBody());
});

speakRoutes.post("/speak/install", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  const body = await jsonBody(c);
  if (!isSpeakEngine(body.engine)) throw new VaultError(400, 'Body field "engine" must be "light" or "natural"');
  void installEngine(body.engine);
  return c.json(statusBody(), 202);
});

// Your own voices (docs/read-aloud.md): read the folder again — a voice just
// dropped in, a file replaced. Answers the status once the scan is done.
speakRoutes.post("/speak/voices/rescan", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  await rescanVoices();
  return c.json(statusBody());
});

speakRoutes.post("/speak", async (c: Context) => {
  const visitor = isPublishLimited(c);
  const settings = speakSettings();
  if (visitor && !settings.public) throw new VaultError(404, "Not found");
  const body = await jsonBody(c);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text === "") throw new VaultError(400, 'Body field "text" must be a non-empty string', "speakEmpty");
  if (text.length > SPEAK_MAX_CHARS) throw new VaultError(413, `One sentence at a time (${SPEAK_MAX_CHARS} characters max)`, "speakTooLong");
  const format = body.format === "wav" ? "wav" : "opus";

  // The note the words came from: its `lang:` for detection, and — for a
  // visitor — the proof that the words are the page's.
  let noteLang: string | null = null;
  let source: string | null = null;
  if (typeof body.path === "string" && body.path !== "") {
    const rel = normalizeRel(body.path);
    if (isNotePath(rel) && (!visitor || isNotePublished(rel))) {
      source = await noteSource(rel);
      const fm = source ? FRONTMATTER_RE.exec(source) : null;
      noteLang = fm?.[1] ? frontmatterLang(fm[1]) : null;
    }
  }
  if (visitor) {
    if (source === null) throw new VaultError(404, "Not found");
    if (!foldForMatch(speechTextOfNote(source)).includes(foldForMatch(text))) {
      throw new VaultError(403, "Only the words of this page can be read aloud", "speakNotOnPage");
    }
  }

  const lang: SpeakLang = isSpeakLang(body.lang)
    ? body.lang
    : detectSpeechLang(text, {
        noteLang,
        context: typeof body.context === "string" ? body.context.slice(0, 2000) : null,
        siteLang: effectiveSettings().language,
      });
  const spoken = closeSentence(text, lang);

  // THE EXTERNAL SPEAKER, for the languages the owner gave it — the owner's
  // only: a visitor is never the reason this server runs a program.
  const external = !visitor && settings.external && settings.external.langs.includes(lang) ? settings.external : null;

  let run: () => Promise<Synthesis>;
  let key: string;
  let engineName: string;
  let voiceName: string;
  if (external) {
    engineName = "external";
    voiceName = "external";
    key = speakCacheKey({ text: spoken, lang, voice: `external\u0000${external.command}`, rate: 1, format: "external" });
    run = () => runExternal({ command: external.command, text: spoken, lang });
  } else {
    const installed = installedEngines();
    const found = await foundVoicesSettled();
    let resolved: ResolvedVoice | null = resolveVoice(lang, settings.engine, settings.voices[lang], installed, found);
    let file: (FoundVoice & { mtime: number }) | null = resolved?.own ? foundVoiceNow(resolved.voice) : null;
    if (resolved?.own && !file) {
      // The file went away since the scan: the next voice answers.
      const gone = resolved.voice;
      resolved = resolveVoice(lang, settings.engine, null, installed, found.filter((v) => v.id !== gone));
      file = resolved?.own ? foundVoiceNow(resolved.voice) : null;
    }
    if (resolved === null || (resolved.own && !file)) {
      return c.json(
        { error: `Nothing installed speaks ${lang}`, code: "speakNotInstalled", lang, needs: engineNeededWith(lang, settings.engine, found) },
        409,
      );
    }
    const { engine, voice } = resolved;
    engineName = engine;
    voiceName = voice;
    // A found voice's key carries its file's mtime: replaced under the same
    // name, it is spoken afresh.
    key = speakCacheKey({ text: spoken, lang, voice: file ? `${voice}@${file.mtime}` : voice, rate: settings.rate, format });
    const job: SpeakJob = file
      ? {
          engine,
          lang,
          // Kokoro names its voice inside the pack; Piper's is the file.
          voice: file.kind === "kokoro" ? (file.speaker ?? voice) : voice,
          speed: settings.rate,
          text: spoken,
          format,
          model: file.model,
          config: file.config,
          speaker: file.speakerId,
          pack: file.pack,
        }
      : { engine, lang, voice, speed: settings.rate, text: spoken, format };
    run = () => synthesize(job);
  }
  const headers = {
    "X-Speak-Lang": lang,
    "X-Speak-Engine": engineName,
    // A found voice's id is a path, which may be anything but ASCII.
    "X-Speak-Voice": encodeURIComponent(voiceName),
    "Cache-Control": "private, max-age=86400",
  };

  const hit = await speakCache().get(key);
  if (hit) return c.body(hit.bytes as Uint8Array<ArrayBuffer>, 200, { ...headers, "Content-Type": hit.mime, "X-Speak-Cache": "hit" });

  if (visitor) {
    const ip = clientIp(c);
    if (visitorLimited(ip)) throw new VaultError(429, "Slow down — try again in a few minutes", "speakRate");
    recordVisitor(ip);
  }
  let out: Synthesis;
  try {
    out = await queue.submit(key, run, c.req.raw.signal);
  } catch (err) {
    // The player walked away (stop, a new selection): nobody reads this.
    if ((err as Error).name === "AbortError") return c.body(null, 204);
    const e = err as SpeakError;
    console.error("speak: synthesis failed:", e.message);
    throw new VaultError(e.status && e.status !== 500 ? e.status : 502, e.message, e.code ?? "engine");
  }
  await speakCache().put(key, out.audio, out.mime);
  return c.body(out.audio as Uint8Array<ArrayBuffer>, 200, {
    ...headers,
    "Content-Type": out.mime,
    "X-Speak-Cache": "miss",
    "X-Speak-Ms": String(out.ms),
  });
});
