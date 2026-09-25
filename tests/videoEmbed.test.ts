// FILM IN A NOTE — the pure half (shared/mediaEmbeds.ts, shared/videoEmbeds.ts,
// shared/fileKinds.ts, shared/attachments.ts, shared/limits.ts,
// shared/embedActions.ts): which
// names are films, what `#t=` and `|poster=` say, the fallback decision a
// browser's `canPlayType` makes, what the server calls each film, and the
// embed menu's rows for one.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAudioName, isTimedMediaName, isVideoName } from "../shared/mediaEmbeds.ts";
import {
  mediaFragmentHash,
  parseMediaFragment,
  parseVideoAlias,
  posterNamesIn,
  videoPlayable,
  videoProbeTypes,
} from "../shared/videoEmbeds.ts";
import { attachmentKindOf, contentTypeFor, isAcceptedAttachment } from "../shared/attachments.ts";
import { UPLOAD_MAX_MB, VIDEO_UPLOAD_MAX_MB, uploadCapMb } from "../shared/limits.ts";
import { embedMenuActions } from "../shared/embedActions.ts";

describe("the film kind", () => {
  it("knows the six containers, case-blind, and nothing else", () => {
    for (const name of ["clip.mp4", "Clip.MOV", "a b.webm", "x.m4v", "film.mkv", "old.ogv", "  media/clip.mp4 "]) {
      assert.equal(isVideoName(name), true, name);
    }
    for (const name of ["lecture.mp3", "pic.png", "notes.md", "mp4", "clip.mp4.md"]) assert.equal(isVideoName(name), false, name);
  });
  it("a WebM is both: a film to draw, a sound a `#t=` link may seek", () => {
    assert.equal(isVideoName("2026-09-23 1402.webm"), true);
    assert.equal(isAudioName("2026-09-23 1402.webm"), true);
    assert.equal(isTimedMediaName("clip.mp4"), true);
    assert.equal(isTimedMediaName("lecture.mp3"), true);
    assert.equal(isTimedMediaName("paper.pdf"), false);
  });
  it("every film extension is a video in the tree and is served with its own type", () => {
    const want: Record<string, string> = {
      mp4: "video/mp4",
      m4v: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      mkv: "video/x-matroska",
      ogv: "video/ogg",
    };
    for (const [ext, type] of Object.entries(want)) {
      assert.equal(attachmentKindOf(`clip.${ext}`), "video", ext);
      assert.equal(contentTypeFor(`clip.${ext}`), type, ext);
      assert.equal(isAcceptedAttachment(`clip.${ext}`), true, `${ext} may be uploaded`);
    }
  });
  it("a film has its own upload cap, larger than a picture's", () => {
    assert.ok(VIDEO_UPLOAD_MAX_MB > UPLOAD_MAX_MB);
    assert.equal(uploadCapMb("mp4"), VIDEO_UPLOAD_MAX_MB);
    assert.equal(uploadCapMb("MKV"), VIDEO_UPLOAD_MAX_MB);
    assert.equal(uploadCapMb("png"), UPLOAD_MAX_MB);
    assert.equal(uploadCapMb(""), UPLOAD_MAX_MB);
  });
});

describe("`#t=` on a film", () => {
  it("reads a start, a range, a range from the top, clock times and Arabic digits", () => {
    assert.deepEqual(parseMediaFragment("t=12"), { start: 12, end: null });
    assert.deepEqual(parseMediaFragment("t=12,30"), { start: 12, end: 30 });
    assert.deepEqual(parseMediaFragment("t=1:05,1:30"), { start: 65, end: 90 });
    assert.deepEqual(parseMediaFragment("t=,30"), { start: 0, end: 30 });
    assert.deepEqual(parseMediaFragment("t=١٢,٣٠"), { start: 12, end: 30 });
  });
  it("refuses what is not a time, and a range that ends before it starts", () => {
    for (const bad of [null, "", "t=", "t=a", "t=30,12", "t=12,12", "t=12,", "page=3", "Heading"]) {
      assert.equal(parseMediaFragment(bad), null, String(bad));
    }
  });
  it("writes the fragment back as the URL hash the player loads", () => {
    assert.equal(mediaFragmentHash({ start: 12, end: null }), "#t=12");
    assert.equal(mediaFragmentHash({ start: 12, end: 30 }), "#t=12,30");
    assert.equal(mediaFragmentHash({ start: 1.23456, end: null }), "#t=1.235");
    // No time named: the first frame, which is what makes it the poster.
    assert.equal(mediaFragmentHash(null), "#t=0.001");
  });
});

describe("`|…` on a film", () => {
  it("is a width, a poster, both in either order, and nothing else", () => {
    assert.deepEqual(parseVideoAlias(null), { width: null, poster: null });
    assert.deepEqual(parseVideoAlias("480"), { width: 480, poster: null });
    assert.deepEqual(parseVideoAlias("poster=frame.jpg"), { width: null, poster: "frame.jpg" });
    assert.deepEqual(parseVideoAlias("480|poster=stills/a frame.png"), { width: 480, poster: "stills/a frame.png" });
    assert.deepEqual(parseVideoAlias("poster = f.jpg | 320"), { width: 320, poster: "f.jpg" });
    assert.deepEqual(parseVideoAlias("My holiday"), { width: null, poster: null }, "a caption does no harm");
    assert.deepEqual(parseVideoAlias("poster="), { width: null, poster: null });
  });
  it("finds every poster a body's film embeds name — and no picture's alias", () => {
    const body = "![[clip.mp4|poster=a.jpg]]\n![[b.webm#t=3|480|poster=b.png]] and ![[pic.png|poster=no.jpg]]\n![[clip.mp4|poster=a.jpg]]";
    assert.deepEqual(posterNamesIn(body), ["a.jpg", "b.png"]);
  });
});

describe("the fallback decision", () => {
  // A stand-in for HTMLMediaElement.canPlayType on a browser that plays
  // WebM and MP4 and says nothing for QuickTime or Matroska.
  const chromeLike = (type: string): string => (type === "video/webm" || type === "video/mp4" ? "maybe" : "");
  const nothing = (): string => "";
  it("asks the containers a film is most likely to be", () => {
    assert.deepEqual(videoProbeTypes("a.mov"), ["video/quicktime", "video/mp4"]);
    assert.deepEqual(videoProbeTypes("a.mkv"), ["video/x-matroska", "video/webm"]);
    assert.deepEqual(videoProbeTypes("a.txt"), []);
  });
  it("draws a player for anything the browser says it may play", () => {
    for (const name of ["a.mp4", "a.m4v", "a.webm", "a.mov", "a.mkv"]) assert.equal(videoPlayable(name, chromeLike), true, name);
  });
  it("falls back to the card when the browser has no answer", () => {
    assert.equal(videoPlayable("a.ogv", chromeLike), false);
    for (const name of ["a.mp4", "a.mkv"]) assert.equal(videoPlayable(name, nothing), false, name);
    assert.equal(videoPlayable("notes.md", () => "probably"), false, "not a film at all");
  });
});

describe("the embed menu on a film", () => {
  const base = { admin: true, resolved: true, clipboardImage: true, clipboardText: true, canEdit: true, touch: false };
  it("offers the file's verbs and never Copy image", () => {
    const rows = embedMenuActions({ ...base, kind: "video" });
    assert.ok(!rows.includes("copyImage"));
    for (const verb of ["copyLink", "copyMarkdown", "copyPath", "open", "reveal", "saveAs", "rename", "remove"] as const) {
      assert.ok(rows.includes(verb), verb);
    }
  });
  it("on a finger, Move… stands in for the drag and Reveal goes", () => {
    const rows = embedMenuActions({ ...base, kind: "video", touch: true });
    assert.ok(rows.includes("move"));
    assert.ok(!rows.includes("reveal"));
  });
  it("a visitor gets Copy link, Open and Save as", () => {
    const rows = embedMenuActions({ ...base, kind: "video", admin: false, canEdit: false }).filter((r) => r !== null);
    assert.deepEqual(rows, ["copyLink", "open", "saveAs"]);
  });
});
