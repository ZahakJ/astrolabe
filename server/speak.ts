// READ ALOUD — the door (docs/read-aloud.md).
//
//   POST /api/speak            { text, lang?, path?, context?, format? } → audio
//   GET  /api/speak/status     what is installed, the install's progress
//   POST /api/speak/install    { engine } → 202; the Settings row polls status
//
// One sentence per request: the client splits a selection with
// shared/speech.ts's splitSentences and asks for each in turn, prefetching the
// next while this one plays, so a word answers at once and a paragraph starts
// speaking before its last sentence exists.
//
// THE ORDER OF OPERATIONS for a POST:
//   1. The language: the caller's, else shared/speech.ts's detection (script,
//      then the note's own `lang:`, then French, then the site).
//   2. The engine: the owner's choice where both speak the language; Arabic is
//      always Piper and Japanese always Kokoro. Nothing installed that speaks
//      it → 409 `speakNotInstalled` naming the engine it needs, and the client
//      reads with the device's own voices instead and SAYS so.
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
  engineFor,
  engineNeeded,
  frontmatterLang,
  isSpeakEngine,
  isSpeakLang,
  speakEffective,
  speechTextOfNote,
  SPEAK_MAX_CHARS,
  voiceFor,
  type SpeakLang,
  type SpeakStatus,
} from "../shared/speech.ts";
import { FRONTMATTER_RE } from "../shared/noteParse.ts";
import { isNotePath } from "../shared/noteFormat.ts";
import { clientIp, isPublishLimited } from "./auth.ts";
import { isNotePublished } from "./indexer.ts";
import { jsonBody } from "./requestBody.ts";
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
  type Synthesis,
} from "./speakEngine.ts";
import { createSpeakQueue, type SpeakQueue } from "./speakQueue.ts";
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

export const speakRoutes = new Hono();

function statusBody(): SpeakStatus {
  const settings = speakEffective(getSettings().speak);
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
  };
}

speakRoutes.get("/speak/status", (c) => {
  const settings = speakEffective(getSettings().speak);
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

speakRoutes.post("/speak", async (c: Context) => {
  const visitor = isPublishLimited(c);
  const settings = speakEffective(getSettings().speak);
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
  const engine = engineFor(lang, settings.engine, installedEngines());
  if (engine === null) {
    return c.json(
      { error: `Nothing installed speaks ${lang}`, code: "speakNotInstalled", lang, needs: engineNeeded(lang, settings.engine) },
      409,
    );
  }
  const voice = voiceFor(engine, lang, settings.voices[lang]) as string;
  const spoken = closeSentence(text, lang);
  const key = speakCacheKey({ text: spoken, lang, voice, rate: settings.rate, format });
  const headers = { "X-Speak-Lang": lang, "X-Speak-Engine": engine, "Cache-Control": "private, max-age=86400" };

  const hit = await speakCache().get(key);
  if (hit) return c.body(hit.bytes as Uint8Array<ArrayBuffer>, 200, { ...headers, "Content-Type": hit.mime, "X-Speak-Cache": "hit" });

  if (visitor) {
    const ip = clientIp(c);
    if (visitorLimited(ip)) throw new VaultError(429, "Slow down — try again in a few minutes", "speakRate");
    recordVisitor(ip);
  }
  let out: Synthesis;
  try {
    out = await queue.submit(key, () => synthesize({ engine, lang, voice, speed: settings.rate, text: spoken, format }), c.req.raw.signal);
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
