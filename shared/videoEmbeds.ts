// WHAT A FILM EMBED SAYS — the pure half of the video player
// (client/reading/video.ts), split from shared/mediaEmbeds.ts so the parsers
// load with the player and not with every page.
//
//   ![[clip.mp4]]               a video player, the note's width at most
//   ![[clip.mp4|480]]           …480 px wide
//   ![[clip.mp4#t=12,30]]       …playing from 0:12 and stopping at 0:30
//   ![[clip.mp4|poster=f.jpg]]  …showing f.jpg until it plays
//
// No DOM: the browser's `canPlayType` is passed in, so the fallback decision
// is tested under node like everything else here.

import { isVideoName, parseTimeAnchor } from "./mediaEmbeds.ts";

/** The MIME types a browser is asked about before a film is drawn as a
 *  player, most specific first. A `.mov` is nearly always H.264 in a
 *  QuickTime box, which a browser that answers "" for `video/quicktime` still
 *  plays when asked as `video/mp4`; a `.mkv` is asked as itself and then as
 *  the WebM it often is. A wrong "maybe" is caught by the player's own error
 *  event, which falls back to the card all the same. */
const VIDEO_PROBES: Readonly<Record<string, readonly string[]>> = {
  mp4: ["video/mp4"],
  m4v: ["video/mp4"],
  webm: ["video/webm"],
  mov: ["video/quicktime", "video/mp4"],
  mkv: ["video/x-matroska", "video/webm"],
  ogv: ["video/ogg"],
};

export function videoProbeTypes(name: string): readonly string[] {
  if (!isVideoName(name)) return [];
  return VIDEO_PROBES[name.trim().slice(name.trim().lastIndexOf(".") + 1).toLowerCase()] ?? [];
}

/** THE FALLBACK DECISION: draw a player, or the file card with a download
 *  line? `canPlayType` is the browser's own `HTMLMediaElement.canPlayType`
 *  ("probably", "maybe" or ""). Any non-empty answer for any probe is a
 *  player. */
export function videoPlayable(name: string, canPlayType: (type: string) => string): boolean {
  return videoProbeTypes(name).some((type) => canPlayType(type) !== "");
}

/** A media fragment: where a film starts, and where it stops (null = the
 *  end). The W3C `t=` spelling — `t=12`, `t=1:05`, `t=12,30`, `t=,30` — so the
 *  same text works on the file's own URL, which is how the player applies it. */
export interface MediaFragment {
  start: number;
  end: number | null;
}

export function parseMediaFragment(anchor: string | null): MediaFragment | null {
  if (anchor === null) return null;
  const m = /^t=([^,]*)(?:,(.*))?$/.exec(anchor.trim());
  if (!m) return null;
  const start = m[1] === "" ? 0 : parseTimeAnchor(`t=${m[1]}`);
  if (start === null) return null;
  if (m[2] === undefined) return m[1] === "" ? null : { start, end: null };
  const end = parseTimeAnchor(`t=${m[2]}`);
  if (end === null || end <= start) return null;
  return { start, end };
}

/** The fragment as a URL hash, `#t=12,30`. With no fragment the player still
 *  asks for `#t=0.001`: a browser that shows nothing before play (Safari)
 *  then draws the first frame, which is the poster the brief promised. */
export function mediaFragmentHash(f: MediaFragment | null): string {
  if (f === null) return "#t=0.001";
  const n = (x: number): string => String(Math.round(x * 1000) / 1000);
  return f.end === null ? `#t=${n(f.start)}` : `#t=${n(f.start)},${n(f.end)}`;
}

/** What a film embed's `|…` says. Pipe-separated, in any order:
 *  a width (`480`) and a still to show before it plays (`poster=frame.jpg`,
 *  resolved like any attachment name). Anything else is ignored rather than
 *  refused, so a caption typed there does no harm. */
export interface VideoOptions {
  width: number | null;
  poster: string | null;
}

export function parseVideoAlias(alias: string | null): VideoOptions {
  const out: VideoOptions = { width: null, poster: null };
  if (alias === null) return out;
  for (const raw of alias.split("|")) {
    const part = raw.trim();
    if (/^\d{2,4}$/.test(part)) out.width = Number(part);
    else {
      const m = /^poster\s*=\s*(.+)$/i.exec(part);
      if (m && m[1].trim() !== "") out.poster = m[1].trim();
    }
  }
  return out;
}

/** Every poster named in a body's film embeds — the indexer adds them to what
 *  a published note may show, since a visitor's page asks for them. */
export function posterNamesIn(body: string): string[] {
  const out: string[] = [];
  const re = /!\[\[([^[\]|#]+)(?:#[^[\]|]*)?\|([^[\]]*)\]\]/g;
  for (let m = re.exec(body); m !== null; m = re.exec(body)) {
    if (!isVideoName(m[1] ?? "")) continue;
    const poster = parseVideoAlias(m[2] ?? null).poster;
    if (poster !== null && !out.includes(poster)) out.push(poster);
  }
  return out;
}
