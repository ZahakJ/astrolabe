// THE PRIVACY POLICY — the one gate between the vault and Discord. Everything
// before it may carry a vault path; everything after it may not, and the
// types say so (Activity → PublicActivity). A title leaves only when the
// owner asked for titles AND the note has not opted out or been excluded,
// and even then as a name, never a path.

import { PRESENCE_TEXT_MAX } from "./config.ts";
import type { Activity, PresenceEffective, PublicActivity } from "./types.ts";

/** A title as Discord may see it: whatever the subject's title was, cut to
 *  its last path segment and stripped of a file extension, because a title
 *  that falls back to a file name must not drag the folders along. */
export function titleOnly(s: string): string {
  const trimmed = s.trim();
  const last = trimmed.split(/[/\\]/).pop() ?? trimmed;
  const bare = last.replace(/\.(excalidraw\.md|md|tex|latex|pdf|epub|excalidraw)$/i, "").trim();
  return clip(bare, PRESENCE_TEXT_MAX);
}

/** Cut to `max` UTF-16 units — the unit a JavaScript service counts in —
 *  without leaving half of a surrogate pair at the end. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}

export function applyPolicy(
  activity: Activity | null,
  settings: PresenceEffective,
  facts: (path: string) => { optOut: boolean; excluded: boolean },
): PublicActivity | null {
  if (settings.mode === "off" || activity === null) return null;
  let title: string | null = null;
  const subject = activity.subject;
  if (settings.mode === "title" && subject !== null && subject.title.trim() !== "") {
    const f = subject.path === null ? null : facts(subject.path);
    if (f === null || (!f.optOut && !f.excluded)) {
      const cut = titleOnly(subject.title);
      title = cut === "" ? null : cut;
    }
  }
  const since =
    settings.elapsed === "off" ? null : settings.elapsed === "subject" ? activity.subjectSince : activity.sessionSince;
  return { kind: activity.kind, title, cardsLeft: activity.cardsLeft, since };
}
