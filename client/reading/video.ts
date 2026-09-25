// FILM: the inline player, and another site's.
//
// `![[clip.mp4]]` is a native <video> where the file card used to be — in the
// editor's live preview, the reading view, the phone's note and the blog
// alike: one builder, like the sound's (reading/audio.ts), `s-rv-*` on every
// surface. What the embed's text may say is shared/mediaEmbeds.ts:
//
//   ![[clip.mp4|480]]              480 px wide (never wider than the note)
//   ![[clip.mp4#t=12,30]]          from 0:12, stopping at 0:30
//   ![[clip.mp4|poster=frame.jpg]] frame.jpg until it plays
//   ![alt](media/clip.mp4)         the standard form, by path
//
// THE PLAYER IS LAZY. Until it scrolls near, it is a box of the right shape
// with no source, so a note with twelve clips asks for none of them; then it
// asks for the file's first bytes only (`preload="metadata"`) and the server
// answers in ranges as the reader seeks (server/fileRoutes.ts). With no poster
// named, the source carries `#t=0.001`, which is what makes every browser
// draw the first frame as the still — Safari otherwise shows a black box.
//
// A FILE THE BROWSER CANNOT PLAY (an .mkv in a codec it has not got) is the
// file card it always was, with a line saying so and a Download link: the
// question is asked before anything loads (`canPlayType`), and asked again
// by the player's own error event, which is the only honest answer for a
// container that says "maybe".
//
// A FILM WITH NO PICTURE folds down to a sound's strip. A WebM is a film by
// its name and a voice note's recording by its content (shared/voice.ts), and
// the player finds out which from the metadata it loads anyway.

import { brokenEmbed, embedKnownBroken, fileUrl, markEmbedBroken, resolveAttachment } from "../editor/embeds.ts";
import { mediaFragmentHash, parseMediaFragment, parseVideoAlias, videoPlayable } from "../../shared/videoEmbeds.ts";
import { externalVideoFor, type ExternalVideo } from "../../shared/externalVideo.ts";
import { t, tf } from "../i18n.ts";
import "./video.css";

export interface VideoSpec {
  /** The name the embed uses (`clip.mp4`, `media/clip.mp4`): what resolves,
   *  and what the caption and the fallback card show. */
  name: string;
  /** A URL already known (the `![](path)` form); null resolves `name`. */
  src: string | null;
  width: number | null;
  /** The embed's `|…` — where `poster=frame.jpg` names the still, an
   *  attachment resolved like the film. */
  alias: string | null;
  /** The embed's `#…` — a `t=12,30` media fragment, or nothing. */
  anchor: string | null;
  /** The box changed height (metadata landed): the editor re-measures. */
  onResize?: () => void;
}

// ── laziness ────────────────────────────────────────────────────────────────

const pending = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | null = null;

/** Run `start` once `el` is within a screen of the viewport. Without an
 *  IntersectionObserver (an old WebView, a test), at once. */
function whenNear(el: Element, start: () => void): void {
  if (typeof IntersectionObserver === "undefined") {
    start();
    return;
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const run = pending.get(entry.target);
        pending.delete(entry.target);
        observer?.unobserve(entry.target);
        run?.();
      }
    },
    { rootMargin: "600px 0px" },
  );
  pending.set(el, start);
  observer.observe(el);
}

// ── the fallback ────────────────────────────────────────────────────────────

function baseName(name: string): string {
  return name.slice(name.lastIndexOf("/") + 1);
}

/** The file card, and a line under it: this browser cannot play it here —
 *  Download. Built into `box`, which keeps its `data-embed-src` (the embed
 *  menu and the drag still work on it). */
function fallBack(box: HTMLElement, name: string, url: string | null): void {
  box.classList.add("s-rv-video--fallback");
  box.style.removeProperty("width");
  const card = document.createElement("a");
  card.className = "s-rv-file";
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  if (url) card.href = url;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toUpperCase() : "VIDEO";
  card.innerHTML =
    '<span class="s-rv-file__icon"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg></span>';
  const label = document.createElement("span");
  label.className = "s-rv-file__name";
  label.textContent = name;
  const badge = document.createElement("span");
  badge.className = "s-rv-file__badge";
  badge.textContent = ext;
  card.append(label, badge);
  const line = document.createElement("span");
  line.className = "s-rv-video__why";
  line.append(document.createTextNode(`${t("videoCannotPlay")} `));
  if (url) {
    const dl = document.createElement("a");
    dl.className = "s-rv-video__download";
    dl.href = url;
    dl.download = baseName(name);
    dl.textContent = t("videoDownload");
    line.append(dl);
  }
  box.replaceChildren(card, line);
}

// ── the player ──────────────────────────────────────────────────────────────

/** The player for one film. A miss is the ⌀ placeholder an image gets.
 *  `box` is the stand-in the reading renderer already put in the page (this
 *  module is loaded on the first film it meets); the player is built into it. */
export function videoPlayer(spec: VideoSpec, box: HTMLElement = document.createElement("span")): HTMLElement {
  const { name } = spec;
  const poster = parseVideoAlias(spec.alias).poster;
  const fragment = parseMediaFragment(spec.anchor);
  box.className = "s-rv-video";
  box.dataset.embedName = name;
  if (spec.width !== null) box.style.width = `${spec.width}px`;

  const video = document.createElement("video");
  video.className = "s-rv-video__player";
  video.controls = true;
  video.preload = "metadata";
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  // Keyboard-reachable on every engine (Chromium puts a controlled <video>
  // in the tab order; Firefox does not).
  video.tabIndex = 0;
  video.setAttribute("aria-label", tf("videoPlayerLabel", { name: baseName(name) }));
  const caption = document.createElement("span");
  caption.className = "s-rv-video__name";
  caption.dir = "auto";
  caption.textContent = baseName(name);
  box.replaceChildren(video, caption);

  const fail = (): void => {
    queueMicrotask(() => box.replaceWith(brokenEmbed(name)));
  };
  // The fallback decision, before a byte is asked for.
  if (!videoPlayable(name, (type) => video.canPlayType(type))) {
    const known = spec.src ?? null;
    fallBack(box, name, known);
    if (known === null) {
      const r = resolveAttachment(name);
      const set = (path: string | null): void => {
        const a = box.querySelectorAll<HTMLAnchorElement>("a");
        if (path) for (const el of a) el.href = fileUrl(path);
      };
      if (r instanceof Promise) void r.then(set);
      else set(r);
    }
    return box;
  }
  if (spec.src === null && embedKnownBroken(name)) {
    fail();
    return box;
  }

  let url: string | null = null;
  video.addEventListener("error", () => {
    // A resolved file the element refused: the codec, not the address.
    if (url !== null && video.getAttribute("src")) {
      fallBack(box, name, url);
      spec.onResize?.();
    }
  });
  video.addEventListener("loadedmetadata", () => {
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      // No picture: a sound in a film's container (a voice note's WebM).
      box.classList.add("s-rv-video--sound");
    } else {
      video.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    }
    spec.onResize?.();
  });
  // `#t=a,b`: most engines stop at b on their own; this is the one that
  // does not, and it stops once — a reader who plays on past it may.
  const end = fragment?.end ?? null;
  if (end !== null) {
    let stopped = false;
    video.addEventListener("timeupdate", () => {
      if (!stopped && video.currentTime >= end) {
        stopped = true;
        video.pause();
      }
    });
  }

  if (poster !== null) {
    const r = resolveAttachment(poster);
    const set = (path: string | null): void => {
      if (path) video.poster = fileUrl(path);
    };
    if (r instanceof Promise) void r.then(set);
    else set(r);
  }

  const mount = (href: string): void => {
    url = href;
    whenNear(box, () => {
      // A named poster with no time: no fragment at all. The `#t=0.001` that
      // draws the first frame is a seek, and a seek takes the poster down.
      video.src = poster !== null && fragment === null ? href : `${href}${mediaFragmentHash(fragment)}`;
    });
  };
  if (spec.src !== null) {
    mount(spec.src);
    return box;
  }
  const r = resolveAttachment(name);
  const apply = (path: string | null): void => {
    if (path === null) {
      markEmbedBroken(name);
      fail();
    } else mount(fileUrl(path));
  };
  if (r instanceof Promise) void r.then(apply);
  else apply(r);
  return box;
}

// ── another site's player ───────────────────────────────────────────────────

const PROVIDER_NAME: Record<ExternalVideo["provider"], string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  peertube: "PeerTube",
};

function frameOf(v: ExternalVideo): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.className = "s-rv-extvideo__frame";
  frame.src = v.embedUrl;
  frame.loading = "lazy";
  frame.title = tf("externalVideoTitle", { provider: PROVIDER_NAME[v.provider] });
  frame.allow = "encrypted-media; picture-in-picture; fullscreen";
  frame.allowFullscreen = true;
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  // What the players need and nothing else: their own scripts on their own
  // origin, fullscreen, and a link out to the host's page.
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups");
  return frame;
}

/**
 * A YouTube / Vimeo / PeerTube film, once "Embed external video" is on
 * (shared/externalVideo.ts decides whether a URL is one, and whether it may
 * be drawn). `card` is the editor's shape: the host's still (YouTube has one
 * at a known address) and a play button that swaps in the frame, so a note
 * being written does not load a third-party player on every keystroke's
 * redraw. The reading view and the blog draw the frame, lazily.
 */
export function externalVideoBlock(v: ExternalVideo, card: boolean): HTMLElement {
  const box = document.createElement("span");
  box.className = "s-rv-extvideo";
  box.dataset.provider = v.provider;
  const stage = document.createElement("span");
  stage.className = "s-rv-extvideo__stage";
  const provider = PROVIDER_NAME[v.provider];
  if (card) {
    const play = document.createElement("button");
    play.type = "button";
    play.className = "s-rv-extvideo__play";
    play.setAttribute("aria-label", tf("externalVideoPlay", { provider }));
    if (v.thumbnail) {
      const img = document.createElement("img");
      img.className = "s-rv-extvideo__thumb";
      img.src = v.thumbnail;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      play.append(img);
    }
    const glyph = document.createElement("span");
    glyph.className = "s-rv-extvideo__glyph";
    glyph.setAttribute("aria-hidden", "true");
    glyph.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
    play.append(glyph);
    play.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      stage.replaceChildren(frameOf(v));
    });
    stage.append(play);
  } else {
    stage.append(frameOf(v));
  }
  const link = document.createElement("a");
  link.className = "s-rv-extvideo__link";
  link.href = v.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = tf("externalVideoOpen", { provider });
  box.append(stage, link);
  return box;
}

/** The reading renderer's hand-off (reading/render.ts): `el` carries an
 *  address in `data-extvideo` — a paragraph that is nothing but a link, or a
 *  markdown picture whose source is a URL — marked only while "Embed external
 *  video" is on. A film becomes its host's player; anything else is left as
 *  it was drawn, and a picture gets the source it was held back from. */
export function hydrateExternalVideo(el: HTMLElement): void {
  const url = el.dataset.extvideo ?? "";
  delete el.dataset.extvideo;
  const v = externalVideoFor(url, true);
  if (v !== null) {
    el.replaceWith(externalVideoBlock(v, false));
    return;
  }
  if (el instanceof HTMLImageElement) el.src = url;
}
