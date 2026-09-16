// SOUND: the inline player, and the link that seeks it.
//
// `![[lecture.mp3]]` is a small native player where the file card used to
// be, in the editor, the reading view and on the site alike — one builder,
// because three copies of an <audio> would be three different players. It
// is `s-rv-*` on every surface, as the transclusion body already is. Its own
// module rather than a corner of editor/embeds.ts, because that file is in
// everyone's entry (the store imports its cache-clearing door) and a player
// belongs to the surfaces that render notes.

import { brokenEmbed, embedKnownBroken, fileUrl, markEmbedBroken, resolveAttachment } from "../editor/embeds.ts";

/** The player for one sound, resolved by name like any other attachment. A
 *  miss is the same ⌀ placeholder an image gets: a player with no source
 *  shows controls that do nothing, which is worse than saying so. */
export function audioPlayer(name: string): HTMLElement {
  const box = document.createElement("span");
  box.className = "s-rv-audio";
  box.dataset.embedName = name;
  const audio = document.createElement("audio");
  audio.className = "s-rv-audio__player";
  audio.controls = true;
  audio.preload = "metadata";
  audio.setAttribute("aria-label", name);
  const label = document.createElement("span");
  label.className = "s-rv-audio__name";
  label.dir = "auto";
  label.textContent = name;
  box.append(audio, label);
  // Deferred a tick: the box is parentless while it is being built, and
  // `replaceWith` on a parentless node is a no-op — the same reason the
  // image card operates on its img (attachEmbedSrc in render.ts).
  const fail = (): void => {
    queueMicrotask(() => box.replaceWith(brokenEmbed(name)));
  };
  if (embedKnownBroken(name)) {
    fail();
    return box;
  }
  audio.addEventListener("error", () => {
    markEmbedBroken(name);
    fail();
  });
  const r = resolveAttachment(name);
  const apply = (path: string | null): void => {
    if (path === null) fail();
    else audio.src = fileUrl(path);
  };
  if (r instanceof Promise) void r.then(apply);
  else apply(r);
  return box;
}

/** `[[lecture.mp3#t=1:23]]`, clicked: the player for that sound on the same
 *  surface seeks and plays. When no player is on the page (the link stands
 *  alone, or the sound is embedded in another note) the file opens in a new
 *  tab at the same moment, through the media fragment every browser reads.
 *  `scope` is the rendered root the click came from, so two panes showing
 *  two copies of a lecture each seek their own. */
export function seekAudio(name: string, seconds: number, scope: ParentNode): void {
  const want = name.trim().toLowerCase();
  const players = [...scope.querySelectorAll<HTMLElement>(".s-rv-audio[data-embed-name]")];
  const hit = players.find((p) => {
    const have = (p.dataset.embedName ?? "").toLowerCase();
    return have === want || have.endsWith(`/${want}`) || want.endsWith(`/${have}`);
  });
  const audio = hit?.querySelector("audio") ?? null;
  if (hit && audio !== null && audio.getAttribute("src")) {
    audio.currentTime = seconds;
    void audio.play().catch(() => {
      // The autoplay policy may refuse until the reader touches the player;
      // the time is set either way, and the controls are right there.
    });
    hit.scrollIntoView({ block: "nearest" });
    return;
  }
  const r = resolveAttachment(name);
  const openAt = (path: string | null): void => {
    if (path === null) return;
    window.open(`${fileUrl(path)}#t=${seconds}`, "_blank", "noopener,noreferrer");
  };
  if (r instanceof Promise) void r.then(openAt);
  else openAt(r);
}
