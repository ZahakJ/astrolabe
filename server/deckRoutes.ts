// Orbits: the vault's own spaced repetition. Mounted from server/api.ts below
// the auth guard; moved out of that file unchanged.

import { Hono } from "hono";
import type { Context } from "hono";
import { deckNotePath, parseDeckFence, restoreCardSchedule, scanDeckCards, serialiseDeck, writeCardSchedule, type DeckKind, type NewCard } from "../shared/decks.ts";
import { review as reviewCard, type Grade, type Schedule } from "../shared/srs.ts";
import { VaultError, assertNotePath, emitEvent, noteExists, readNote, suppressWatcherEcho, writeNote } from "./vault.ts";
import { cards, deckCards, decks, indexFile } from "./indexer.ts";
import { isPublishLimited } from "./auth.ts";
import { jsonBody, requiredString } from "./requestBody.ts";

export const deckRoutes = new Hono();

/** A schedule as the client sends one back (the session's undo), null for
 *  "none", or undefined for anything else — the plugin's comment shape is
 *  a day, a whole number of days and an ease, and nothing looser goes in
 *  the note. */
function scheduleOf(value: unknown): Schedule | null | undefined {
  if (value === null) return null;
  if (typeof value !== "object") return undefined;
  const s = value as Record<string, unknown>;
  if (typeof s.due !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.due)) return undefined;
  if (typeof s.interval !== "number" || !Number.isInteger(s.interval) || s.interval < 0 || s.interval > 36500) return undefined;
  if (typeof s.ease !== "number" || !Number.isInteger(s.ease) || s.ease < 0 || s.ease > 100000) return undefined;
  return { due: s.due, interval: s.interval, ease: s.ease };
}

// ------------------------------------------------------------ decks
// The vault's own spaced repetition (shared/decks.ts). A grade
// writes the next schedule into the note as the Spaced Repetition plugin's
// own comment, so a vault reviewed in Obsidian and here is one vault. Admin
// only — the guard above 401s a visitor's POST, and the lists are refused
// below. `GET /api/cards` and `POST /api/card/review` are the Orbits session's
// older names for the implicit deck and a front→back grade; they
// stay so an open tab from before the shelf keeps working.
deckRoutes.get("/cards", (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  return c.json(cards());
});

/** `today` is the CLIENT's day: due is a local-calendar question and the
 *  server's clock may sit in another zone. */
function todayOf(value: unknown): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}

deckRoutes.get("/orbits", (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  return c.json(decks(todayOf(c.req.query("today"))));
});

deckRoutes.get("/orbits/cards", (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  const notePath = c.req.query("path") ?? "";
  if (notePath === "") throw new VaultError(400, "A deck needs a path");
  const section = c.req.query("section");
  const stars = deckCards(notePath, section === undefined || section === "" ? null : section);
  if (stars === null) throw new VaultError(404, `Not a deck: ${notePath}`);
  return c.json(stars);
});

/** One grade on one star. The star is re-found in the note AS IT IS NOW —
 *  a line may have moved under an edit in another pane — and the schedule
 *  is written into the slot the star owns (the second of a `:::` pair's
 *  comment for its back→front twin). The write goes under the mtime
 *  precondition like every line edit. */
async function reviewDeckCardRoute(c: Context): Promise<Response> {
  const body = await jsonBody(c);
  const notePath = requiredString(body, "path");
  const line = typeof body.line === "number" && Number.isInteger(body.line) && body.line >= 1 ? body.line : 0;
  if (line === 0) throw new VaultError(400, "A card needs a line");
  const dir = body.dir === "rev" ? "rev" : "fwd";
  const grade = body.grade;
  if (grade !== "again" && grade !== "hard" && grade !== "good" && grade !== "easy") throw new VaultError(400, "Grade one of again, hard, good, easy");
  const today = todayOf(body.today);
  // UNDO: `restore` present means "put this schedule back", not "grade" —
  // the one the star had before the last grade, verbatim, or null to take
  // out the comment a first grade wrote. The client sends the grade along
  // for a server that predates the field; that server re-grades, and the
  // client sees the schedule differ and says so.
  const undo = Object.prototype.hasOwnProperty.call(body, "restore");
  const restore = undo ? scheduleOf(body.restore) : undefined;
  if (undo && restore === undefined) throw new VaultError(400, "restore must be a schedule {due, interval, ease} or null");
  const note = await readNote(notePath);
  const kind = parseDeckFence(note.content)?.kind ?? "basic";
  const star = scanDeckCards(note.content, note.path, kind).find((s) => s.line === line && s.dir === dir);
  if (!star) throw new VaultError(409, "That card is gone", "stale");
  const schedule = restore !== undefined ? restore : reviewCard(star.schedule, grade as Grade, today);
  const next = restore !== undefined ? restoreCardSchedule(note.content, star, restore) : writeCardSchedule(note.content, star, schedule as Schedule);
  if (next !== note.content) {
    suppressWatcherEcho(note.path);
    await writeNote(note.path, next, note.mtimeMs);
    emitEvent({ kind: "changed", path: note.path });
    await indexFile(note.path);
  }
  return c.json({ ok: true, path: note.path, line, dir, schedule });
}

deckRoutes.post("/orbits/card/review", reviewDeckCardRoute);
deckRoutes.post("/card/review", reviewDeckCardRoute);

/** A new deck from the modal or the importer: `<folder>/<title>.md`
 *  through the vault's own create path — the title made a filename by the
 *  composer's rule, an existing note never overwritten (409), the mirror
 *  and the watchers told the way every other creation tells them. */
deckRoutes.post("/orbits", async (c) => {
  const body = await jsonBody(c);
  const title = requiredString(body, "title").trim();
  if (title === "") throw new VaultError(400, "A deck needs a title");
  const kinds: DeckKind[] = ["basic", "reversed", "both", "typed", "cloze-only"];
  const kind = typeof body.kind === "string" && (kinds as string[]).includes(body.kind) ? (body.kind as DeckKind) : "basic";
  const icon = typeof body.icon === "string" && body.icon.trim() ? Array.from(body.icon.trim()).slice(0, 8).join("") : null;
  const folder = typeof body.folder === "string" ? body.folder : null;
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : [];
  const newPerDay = typeof body.newPerDay === "number" && Number.isFinite(body.newPerDay) && body.newPerDay >= 0 ? Math.floor(body.newPerDay) : undefined;
  const cards: NewCard[] = [];
  if (Array.isArray(body.cards)) {
    for (const raw of body.cards) {
      if (typeof raw !== "object" || raw === null) continue;
      const card = raw as Record<string, unknown>;
      if (typeof card.front !== "string" || typeof card.back !== "string") continue;
      cards.push({
        front: card.front,
        back: card.back,
        extra: typeof card.extra === "string" ? card.extra : null,
        section: typeof card.section === "string" ? card.section : null,
      });
    }
  }
  const notePath = assertNotePath(deckNotePath(folder, title));
  if (await noteExists(notePath)) throw new VaultError(409, `Note already exists: ${notePath}`, "exists");
  const text = serialiseDeck({ title, icon, kind, tags, newPerDay }, cards);
  const written = await writeNote(notePath, text);
  await indexFile(notePath);
  emitEvent({ kind: "created", path: notePath });
  return c.json({ ok: true, path: written.path, cards: scanDeckCards(text, notePath, kind).length });
});
