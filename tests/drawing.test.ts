// The drawing formats (shared/drawing.ts): the two spellings on disk, what a
// drawing's words are, and that a save keeps what the other tool wrote.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import lz from "lz-string";
const { compressToBase64 } = lz;
import {
  drawingIndexText,
  drawingTexts,
  emptyScene,
  newDrawingContent,
  parseDrawing,
  serializeDrawing,
} from "../shared/drawing.ts";
import { drawingSvgPath, isDrawingPath, noteTitleOf, stripNoteExt } from "../shared/noteFormat.ts";

const text = (id: string, t: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "text",
  text: t,
  x: 0,
  y: 0,
  isDeleted: false,
  ...extra,
});
const scene = {
  elements: [
    { id: "r1", type: "rectangle", x: 0, y: 0, width: 10, height: 10, link: "[[Physical Memory]]" },
    text("t1", "Hello [[World]]"),
    text("t2", "gone", { isDeleted: true }),
    text("t3", "مرحبا"),
  ],
  appState: { viewBackgroundColor: "#ffffff", collaborators: new Map(), selectedElementIds: { t1: true } },
  files: {},
};
const json = JSON.stringify({ type: "excalidraw", version: 2, elements: scene.elements, appState: scene.appState, files: {} });

describe("a drawing's paths", () => {
  it("names both spellings and nothing else", () => {
    assert.equal(isDrawingPath("a/Sketch.excalidraw"), true);
    assert.equal(isDrawingPath("a/Sketch.excalidraw.md"), true);
    assert.equal(isDrawingPath("a/Sketch.md"), false);
    assert.equal(isDrawingPath("a/.excalidraw"), false);
    assert.equal(isDrawingPath("a/notes.excalidrawx"), false);
  });
  it("maps to one exported picture, and one title", () => {
    assert.equal(drawingSvgPath("a/Sketch.excalidraw"), "a/Sketch.excalidraw.svg");
    assert.equal(drawingSvgPath("a/Sketch.excalidraw.md"), "a/Sketch.excalidraw.svg");
    assert.equal(noteTitleOf("a/Sketch.excalidraw.md"), "Sketch");
    assert.equal(noteTitleOf("a/Sketch.excalidraw"), "Sketch");
    assert.equal(stripNoteExt("Sketch.excalidraw"), "Sketch");
  });
});

describe("reading a drawing", () => {
  it("reads Excalidraw's own JSON and drops the session state", () => {
    const d = parseDrawing("a.excalidraw", json);
    assert.ok(d);
    assert.equal(d.format, "json");
    assert.equal(d.scene.elements.length, 4);
    assert.equal("collaborators" in d.scene.appState, false);
    assert.equal("selectedElementIds" in d.scene.appState, false);
  });
  it("reads the Obsidian plugin's markdown, plain and compressed", () => {
    const plain = `---\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n---\n# Excalidraw Data\n\n## Text Elements\nHello ^t1\n\n%%\n## Drawing\n\`\`\`json\n${json}\n\`\`\`\n%%`;
    const d = parseDrawing("a.excalidraw.md", plain);
    assert.ok(d);
    assert.equal(d.format, "plugin");
    assert.equal(d.compressed, false);
    assert.equal(d.frontmatter, "excalidraw-plugin: parsed\ntags: [excalidraw]");
    const packed = compressToBase64(json);
    const wrapped = packed.match(/.{1,40}/g)!.join("\n");
    const compressed = `---\nexcalidraw-plugin: parsed\n---\n%%\n## Drawing\n\`\`\`compressed-json\n${wrapped}\n\`\`\`\n%%`;
    const c = parseDrawing("a.excalidraw.md", compressed);
    assert.ok(c);
    assert.equal(c.compressed, true);
    assert.equal(c.scene.elements.length, 4);
  });
  it("an empty file and a plugin note with no scene yet are empty scenes; junk is null", () => {
    assert.equal(parseDrawing("a.excalidraw", "")?.scene.elements.length, 0);
    assert.equal(parseDrawing("a.excalidraw.md", "---\nexcalidraw-plugin: parsed\n---\n")?.scene.elements.length, 0);
    assert.equal(parseDrawing("a.excalidraw", "not json"), null);
    assert.equal(parseDrawing("a.excalidraw.md", "# just a note\n"), null);
    assert.equal(parseDrawing("a.md", json), null);
  });
});

describe("a drawing's words", () => {
  it("are its live text elements and its element links, in order", () => {
    assert.deepEqual(drawingTexts(scene), ["[[Physical Memory]]", "Hello [[World]]", "مرحبا"]);
  });
  it("are what the indexer files, under the plugin frontmatter when there is one", () => {
    const idx = drawingIndexText("a.excalidraw", json);
    assert.match(idx, /Hello \[\[World\]\]/);
    assert.doesNotMatch(idx, /"type"/);
    const plugin = `---\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n---\n%%\n## Drawing\n\`\`\`json\n${json}\n\`\`\`\n%%`;
    assert.match(drawingIndexText("a.excalidraw.md", plugin), /^---\nexcalidraw-plugin: parsed\ntags: \[excalidraw\]\n---\n/);
  });
});

describe("writing a drawing", () => {
  it("round-trips JSON", () => {
    const d = parseDrawing("a.excalidraw", json)!;
    const back = parseDrawing("a.excalidraw", serializeDrawing(d))!;
    assert.deepEqual(back.scene.elements, d.scene.elements);
    assert.equal(serializeDrawing(d).endsWith("\n"), true);
  });
  it("writes the plugin's shape with the text elements listed, keeps the frontmatter, and honours compression", () => {
    const d = parseDrawing("a.excalidraw.md", `---\nexcalidraw-plugin: parsed\ntags: [excalidraw, mine]\n---\n%%\n## Drawing\n\`\`\`json\n${json}\n\`\`\`\n%%`)!;
    const out = serializeDrawing(d);
    assert.match(out, /^---\nexcalidraw-plugin: parsed\ntags: \[excalidraw, mine\]\n---\n/);
    assert.match(out, /## Text Elements\n\[\[Physical Memory\]\] \^r1\n\nHello \[\[World\]\] \^t1\n\nمرحبا \^t3/);
    assert.match(out, /%%\n## Drawing\n```json\n/);
    const again = parseDrawing("a.excalidraw.md", out)!;
    assert.deepEqual(again.scene.elements, d.scene.elements);
    const packed = serializeDrawing({ ...d, compressed: true });
    assert.match(packed, /```compressed-json\n/);
    assert.deepEqual(parseDrawing("a.excalidraw.md", packed)!.scene.elements, d.scene.elements);
  });
  it("a new file is an empty scene in the format asked for", () => {
    assert.equal(parseDrawing("n.excalidraw", newDrawingContent("json"))?.scene.elements.length, 0);
    const plugin = newDrawingContent("plugin");
    assert.match(plugin, /^---\nexcalidraw-plugin: parsed\n/);
    assert.deepEqual(parseDrawing("n.excalidraw.md", plugin)?.scene.elements, emptyScene().elements);
  });
});
