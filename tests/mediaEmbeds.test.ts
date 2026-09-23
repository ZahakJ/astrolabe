// Sound and page embeds (shared/mediaEmbeds.ts): which names play, what a
// timestamp anchor means, which page a PDF embed asks for.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatTime, isAudioName, parseTimeAnchor, pdfDisplayName, pdfPageOf } from "../shared/mediaEmbeds.ts";

describe("audio embeds", () => {
  it("recognise the four formats a browser plays, case-blind", () => {
    for (const name of ["lecture.mp3", "Talk.OGG", "voice.m4a", "take 1.wav", "2026-09-23 1402.webm"]) assert.equal(isAudioName(name), true, name);
    for (const name of ["lecture.flac", "clip.mp4", "notes.md", "mp3"]) assert.equal(isAudioName(name), false, name);
  });
  it("read t= anchors in seconds, m:ss, h:mm:ss, decimals and Arabic digits", () => {
    assert.equal(parseTimeAnchor("t=83"), 83);
    assert.equal(parseTimeAnchor("t=1:23"), 83);
    assert.equal(parseTimeAnchor("t=1:02:03"), 3723);
    assert.equal(parseTimeAnchor("t=90.5"), 90.5);
    assert.equal(parseTimeAnchor("t=١:٢٣"), 83);
    assert.equal(parseTimeAnchor(" t=0:05 "), 5);
  });
  it("refuse anything that is not a time", () => {
    for (const bad of ["t=", "t=a:b", "1:23", "t=1:2:3:4", "t=1::3", "Heading"]) assert.equal(parseTimeAnchor(bad), null, bad);
  });
  it("print a time the way a player does", () => {
    assert.equal(formatTime(83), "1:23");
    assert.equal(formatTime(5), "0:05");
    assert.equal(formatTime(3723), "1:02:03");
    assert.equal(formatTime(-3), "0:00");
  });
});

describe("pdf page embeds", () => {
  it("take the page from a page= anchor and from a full citation anchor", () => {
    assert.equal(pdfPageOf("Book.pdf", "page=42"), 42);
    assert.equal(pdfPageOf("Library/Ihya.PDF", "page=7&rect=0.1,0.2,0.3,0.4&id=abc"), 7);
  });
  it("are not a page when the target is not a PDF or the anchor is a heading", () => {
    assert.equal(pdfPageOf("Book.pdf", null), null);
    assert.equal(pdfPageOf("Book.pdf", "Chapter 2"), null);
    assert.equal(pdfPageOf("Note.md", "page=42"), null);
    assert.equal(pdfPageOf("Book.pdf", "page=one"), null);
  });
  it("name the book without its folders or extension", () => {
    assert.equal(pdfDisplayName("Library/Ihya.pdf"), "Ihya");
    assert.equal(pdfDisplayName("Muqaddima.PDF"), "Muqaddima");
  });
});
