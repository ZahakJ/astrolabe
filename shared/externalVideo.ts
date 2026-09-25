// A FILM ON SOMEONE ELSE'S SITE — the pure half of "Embed external video".
//
// A bare YouTube, Vimeo or PeerTube address on a line of its own, or written
// as `![](https://youtube.com/watch?v=…)`, becomes that site's player in the
// note — but ONLY when the owner has turned Settings → Publishing → "Embed
// external video" on. A third-party frame tells the third party who is
// reading, which is a decision for the owner and not for this parser; with
// the switch off (the default) the address stays the link it was.
//
// The frame is always the privacy-enhanced one the host offers: YouTube's
// `youtube-nocookie.com`, Vimeo's `dnt=1`. PeerTube is a federation of
// servers, not a host, so an address is recognised by the shape of its path
// (`/w/<id>`, `/videos/watch/<id>`) on any https server.
//
// No DOM, no settings, no I/O: the renderers and the tests call the same code.

export type VideoProvider = "youtube" | "vimeo" | "peertube";

export interface ExternalVideo {
  provider: VideoProvider;
  id: string;
  /** The URL as written — what the link and the card open. */
  url: string;
  /** The privacy-enhanced player for an <iframe>. */
  embedUrl: string;
  /** A still to put on the editor's card, when the host has one at a known
   *  address (YouTube does; Vimeo and PeerTube need an API call, which this
   *  does not make). */
  thumbnail: string | null;
  /** Where to start, in seconds, when the URL says. */
  start: number | null;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
// A PeerTube id: the 22-character short uuid of `/w/…`, or a full uuid.
const PT_ID = /^([A-Za-z0-9]{22}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** `90`, `1m30s`, `1h2m3s`, `90s` → seconds; null for anything else. */
export function parseStartParam(raw: string | null): number | null {
  if (raw === null || raw === "") return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!m || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** What a URL is as a film, or null when it is not one of the three. Only
 *  `https:` (and YouTube/Vimeo over `http:`, upgraded) — a frame over plain
 *  http is refused by the page anyway. */
export function parseExternalVideo(raw: string): ExternalVideo | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  const url = raw.trim();
  const segs = u.pathname.split("/").filter(Boolean);
  const hash = new URLSearchParams(u.hash.replace(/^#/, ""));
  const startOf = (): number | null => parseStartParam(u.searchParams.get("t") ?? u.searchParams.get("start") ?? hash.get("t"));

  if (YT_HOSTS.has(host) || host === "youtu.be") {
    let id: string | null = null;
    if (host === "youtu.be") id = segs[0] ?? null;
    else if (segs[0] === "watch") id = u.searchParams.get("v");
    else if (segs[0] === "shorts" || segs[0] === "embed" || segs[0] === "live" || segs[0] === "v") id = segs[1] ?? null;
    if (id === null || !YT_ID.test(id)) return null;
    const start = startOf();
    return {
      provider: "youtube",
      id,
      url,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}${start !== null ? `?start=${start}` : ""}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      start,
    };
  }

  if (VIMEO_HOSTS.has(host)) {
    // vimeo.com/123456789, vimeo.com/123456789/<hash> (unlisted),
    // player.vimeo.com/video/123456789, vimeo.com/channels/x/123456789.
    const at = host === "player.vimeo.com" ? (segs[0] === "video" ? 1 : -1) : segs.findIndex((s) => /^\d{5,}$/.test(s));
    const id = at >= 0 ? segs[at] : undefined;
    if (id === undefined || !/^\d{5,}$/.test(id)) return null;
    const unlisted = u.searchParams.get("h") ?? (segs[at + 1] && /^[0-9a-f]{6,}$/i.test(segs[at + 1]) ? segs[at + 1] : null);
    const start = startOf();
    const q = new URLSearchParams({ dnt: "1" });
    if (unlisted) q.set("h", unlisted);
    return {
      provider: "vimeo",
      id,
      url,
      embedUrl: `https://player.vimeo.com/video/${id}?${q.toString()}${start !== null ? `#t=${start}s` : ""}`,
      thumbnail: null,
      start,
    };
  }

  if (u.protocol === "https:") {
    let id: string | null = null;
    if (segs[0] === "w" && segs.length === 2) id = segs[1];
    else if (segs[0] === "videos" && (segs[1] === "watch" || segs[1] === "embed") && segs.length === 3) id = segs[2];
    if (id !== null && PT_ID.test(id)) {
      const start = startOf();
      return {
        provider: "peertube",
        id,
        url,
        embedUrl: `https://${u.host}/videos/embed/${id}${start !== null ? `?start=${start}s` : ""}`,
        thumbnail: null,
        start,
      };
    }
  }
  return null;
}

/** The one gate every renderer asks: the film, when the switch is on and the
 *  URL is one; null otherwise — and null means "draw the link". */
export function externalVideoFor(url: string, enabled: boolean): ExternalVideo | null {
  return enabled ? parseExternalVideo(url) : null;
}

/** A line that is nothing but a URL (angle brackets allowed), or a markdown
 *  image whose destination is one: the address, or null. What "on its own
 *  line" means for the reading view, the blog and the editor alike. */
export function externalVideoLine(line: string): string | null {
  const t = line.trim();
  let m = /^<?(https?:\/\/[^\s<>]+?)>?$/.exec(t);
  if (m) return m[1];
  m = /^!\[[^\]\n]*\]\(<?(https?:\/\/[^\s<>)]+)>?(?:\s+"[^"]*")?\)$/.exec(t);
  return m ? m[1] : null;
}
