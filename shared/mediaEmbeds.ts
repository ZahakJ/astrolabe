// WHAT AN `![[…]]` OF A SOUND OR A PAGE IS — the pure half of two embed
// kinds that draw something other than a card.
//
//   ![[lecture.mp3]]            a small player where the card used to be
//   [[lecture.mp3#t=1:23]]      a link that seeks that player to 1:23
//   ![[Book.pdf#page=42]]       page 42 of the book, drawn as a picture
//
// The client's embed parser (client/editor/embeds.ts) asks these questions
// and cannot be tested under node — it imports the API and the dictionary —
// so the questions live here, beside the book anchor they reuse. Nothing
// here touches a DOM.

import { parseBookAnchor } from "./bookAnchor.ts";

/** The sounds a browser plays without help. `flac` is left as a file card:
 *  Safari will not play it inline, and a player that shows controls and
 *  then refuses is worse than a card that opens the file. */
const AUDIO_EXT = /\.(mp3|ogg|m4a|wav)$/i;

export function isAudioName(name: string): boolean {
  return AUDIO_EXT.test(name.trim());
}

/** `t=1:23` → 83; also `t=83`, `t=1:02:03`, `t=90.5`, and Eastern Arabic
 *  digits in any of them. Null for anything else — the anchor is then an
 *  ordinary heading and the link an ordinary link. The `t=` spelling is the
 *  W3C media-fragment one, so the same anchor works on the file's own URL
 *  when there is no player on the page to seek. */
export function parseTimeAnchor(anchor: string): number | null {
  const m = /^t=([0-9٠-٩:.]+)$/.exec(anchor.trim());
  if (!m) return null;
  const latin = m[1].replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const parts = latin.split(":");
  if (parts.length > 3 || parts.some((p) => p === "" || !/^\d+(\.\d+)?$/.test(p))) return null;
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + Number(part);
  return Number.isFinite(seconds) ? seconds : null;
}

/** 83 → "1:23", 3723 → "1:02:03". What a timestamp link shows when it has
 *  no alias of its own. */
export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const two = (n: number): string => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** The page an embed names when its target is a PDF and its anchor a real
 *  page number (`page=42`, or a full citation anchor with a rect and an id —
 *  the page is what a picture of it needs). Null otherwise: a PDF embed with
 *  no page stays the file card it always was. */
export function pdfPageOf(target: string, anchor: string | null): number | null {
  if (anchor === null || !/\.pdf$/i.test(target.trim())) return null;
  return parseBookAnchor(anchor)?.page ?? null;
}

/** "Book, p. 42" wants the book's name without its extension and its
 *  folders: `Library/Ihya.pdf` → `Ihya`. */
export function pdfDisplayName(target: string): string {
  const base = target.trim().split("/").pop() ?? target;
  return base.replace(/\.pdf$/i, "");
}
