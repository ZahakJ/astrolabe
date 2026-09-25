// ANOTHER SITE'S FILM (shared/externalVideo.ts): which addresses are films,
// the privacy-enhanced player each becomes, and the switch that has to be on
// before any of it is drawn.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { externalVideoFor, externalVideoLine, parseExternalVideo, parseStartParam } from "../shared/externalVideo.ts";

describe("YouTube", () => {
  it("reads every common spelling to one id, played from youtube-nocookie.com", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL1",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ]) {
      const v = parseExternalVideo(url);
      assert.ok(v, url);
      assert.equal(v.provider, "youtube");
      assert.equal(v.id, "dQw4w9WgXcQ");
      assert.equal(v.embedUrl, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
      assert.equal(v.thumbnail, "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    }
  });
  it("carries a start time", () => {
    assert.equal(parseExternalVideo("https://youtu.be/dQw4w9WgXcQ?t=90")?.embedUrl, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90");
    assert.equal(parseExternalVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s")?.start, 90);
  });
  it("refuses a channel, a search, a malformed id", () => {
    for (const url of ["https://www.youtube.com/@someone", "https://www.youtube.com/results?search_query=x", "https://youtu.be/short", "https://www.youtube.com/watch?v="]) {
      assert.equal(parseExternalVideo(url), null, url);
    }
  });
});

describe("Vimeo", () => {
  it("plays with dnt=1, and keeps an unlisted film's hash", () => {
    assert.equal(parseExternalVideo("https://vimeo.com/76979871")?.embedUrl, "https://player.vimeo.com/video/76979871?dnt=1");
    assert.equal(parseExternalVideo("https://player.vimeo.com/video/76979871")?.id, "76979871");
    assert.equal(parseExternalVideo("https://vimeo.com/76979871/abcdef1234")?.embedUrl, "https://player.vimeo.com/video/76979871?dnt=1&h=abcdef1234");
    assert.equal(parseExternalVideo("https://vimeo.com/channels/staffpicks/76979871")?.id, "76979871");
    assert.equal(parseExternalVideo("https://vimeo.com/76979871#t=30s")?.embedUrl, "https://player.vimeo.com/video/76979871?dnt=1#t=30s");
    assert.equal(parseExternalVideo("https://vimeo.com/about"), null);
  });
});

describe("PeerTube", () => {
  it("is recognised by its path on any https server", () => {
    const short = parseExternalVideo("https://framatube.org/w/9c9de5e8-0a1e-484a-b099-e80766180a6d");
    assert.equal(short?.provider, "peertube");
    assert.equal(short?.embedUrl, "https://framatube.org/videos/embed/9c9de5e8-0a1e-484a-b099-e80766180a6d");
    const w = parseExternalVideo("https://peertube.example/w/kkGMgK9ZtnKfYAgnEtQxbv");
    assert.equal(w?.embedUrl, "https://peertube.example/videos/embed/kkGMgK9ZtnKfYAgnEtQxbv");
    assert.equal(parseExternalVideo("https://peertube.example/videos/watch/kkGMgK9ZtnKfYAgnEtQxbv?start=1m")?.start, 60);
  });
  it("is not any page whose path starts /w/", () => {
    assert.equal(parseExternalVideo("https://en.wikipedia.org/w/index.php"), null);
    assert.equal(parseExternalVideo("http://peertube.example/w/kkGMgK9ZtnKfYAgnEtQxbv"), null, "not over plain http");
    assert.equal(parseExternalVideo("https://example.com/clip.mp4"), null);
    assert.equal(parseExternalVideo("not a url"), null);
  });
});

describe("the switch", () => {
  it("off — the default — nothing is a film, and the address stays a link", () => {
    assert.equal(externalVideoFor("https://youtu.be/dQw4w9WgXcQ", false), null);
  });
  it("on, a film is a film and anything else is still a link", () => {
    assert.equal(externalVideoFor("https://youtu.be/dQw4w9WgXcQ", true)?.provider, "youtube");
    assert.equal(externalVideoFor("https://example.com/", true), null);
  });
});

describe("a line of its own", () => {
  it("is a bare address, an angled one, or a markdown image of one", () => {
    assert.equal(externalVideoLine("https://youtu.be/dQw4w9WgXcQ"), "https://youtu.be/dQw4w9WgXcQ");
    assert.equal(externalVideoLine("  <https://youtu.be/dQw4w9WgXcQ>  "), "https://youtu.be/dQw4w9WgXcQ");
    assert.equal(externalVideoLine("![talk](https://vimeo.com/76979871)"), "https://vimeo.com/76979871");
    assert.equal(externalVideoLine('![](https://vimeo.com/76979871 "a title")'), "https://vimeo.com/76979871");
  });
  it("is not an address inside a sentence", () => {
    assert.equal(externalVideoLine("watch https://youtu.be/dQw4w9WgXcQ today"), null);
    assert.equal(externalVideoLine("[a link](https://youtu.be/dQw4w9WgXcQ)"), null);
  });
  it("reads a start written the three ways hosts write it", () => {
    assert.equal(parseStartParam("90"), 90);
    assert.equal(parseStartParam("1h2m3s"), 3723);
    assert.equal(parseStartParam("45s"), 45);
    assert.equal(parseStartParam("soon"), null);
    assert.equal(parseStartParam(null), null);
  });
});
