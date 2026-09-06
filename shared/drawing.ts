// A drawing on disk, in the two spellings the vault may hold.
//
// Vellum did not invent a drawing format, because a vault's drawings already
// have one: Excalidraw's own `.excalidraw` JSON scene, and the shape the
// Obsidian Excalidraw plugin writes into a markdown note (`.excalidraw.md`) so
// that Obsidian's tree, links and search see it as a note. Both open here and
// both keep working there — the same promise every other file in the vault
// carries. What this module knows is how to read either into one scene, how to
// write each back without losing what the other tool put there, and what a
// drawing's TEXT is, so search and the graph can read a picture.
//
// Dependency-light on purpose: the server indexes drawings with it, the client
// saves them with it, and neither wants the editor's bundle for that.

// lz-string ships CommonJS only; a named import fails under Node.
import lz from "lz-string";
const { compressToBase64, decompressFromBase64 } = lz;

export type DrawingFormat = "json" | "plugin";

/** The scene as the three lists Excalidraw's `initialData` takes. Elements
 *  are opaque here: this module never interprets one beyond reading a text
 *  element's words. */
export interface DrawingScene {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

export interface Drawing {
  format: DrawingFormat;
  /** Plugin files only: the scene was stored LZ-compressed (the plugin's
   *  `compress: true` setting). Remembered so a save writes the same way and
   *  Obsidian is not surprised by a file that changed shape under it. */
  compressed: boolean;
  scene: DrawingScene;
  /** Plugin files only: the frontmatter block, verbatim, so a save keeps the
   *  tags and plugin keys the owner or the plugin put there. */
  frontmatter: string | null;
}

const PLUGIN_HEADER = "excalidraw-plugin: parsed";

/** An empty scene, in the format a new file should take. */
export function emptyScene(): DrawingScene {
  return { elements: [], appState: { gridSize: null, viewBackgroundColor: "#ffffff" }, files: {} };
}

/** The JSON Excalidraw itself reads and writes (`serializeAsJSON`'s shape). */
function sceneJson(scene: DrawingScene): string {
  return JSON.stringify(
    {
      type: "excalidraw",
      version: 2,
      source: "https://github.com/ZahakJ/vellum",
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
    },
    null,
    2,
  );
}

function sceneOf(raw: unknown): DrawingScene | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const elements = Array.isArray(o.elements) ? o.elements : null;
  if (elements === null) return null;
  const appState = o.appState && typeof o.appState === "object" ? (o.appState as Record<string, unknown>) : {};
  const files = o.files && typeof o.files === "object" ? (o.files as Record<string, unknown>) : {};
  // Collaboration and UI state that has no business in a file and that the
  // editor refuses to restore anyway; the plugin strips the same keys.
  const cleaned: Record<string, unknown> = { ...appState };
  delete cleaned.collaborators;
  delete cleaned.selectedElementIds;
  delete cleaned.editingElement;
  return { elements, appState: cleaned, files };
}

/** Read a drawing from either spelling. Null when the content is not a
 *  drawing at all — a `.excalidraw.md` with no scene fence, or JSON that is
 *  not a scene — so a caller can show the source rather than an empty canvas
 *  it would then save over the file. */
export function parseDrawing(rel: string, content: string): Drawing | null {
  const lower = rel.toLowerCase();
  if (lower.endsWith(".excalidraw.md")) return parsePlugin(content);
  if (lower.endsWith(".excalidraw")) {
    const trimmed = content.trim();
    if (trimmed === "") return { format: "json", compressed: false, scene: emptyScene(), frontmatter: null };
    try {
      const scene = sceneOf(JSON.parse(trimmed));
      return scene === null ? null : { format: "json", compressed: false, scene, frontmatter: null };
    } catch {
      return null;
    }
  }
  return null;
}

function parsePlugin(content: string): Drawing | null {
  let frontmatter: string | null = null;
  let body = content;
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (fm) {
    frontmatter = fm[1];
    body = content.slice(fm[0].length);
  }
  // The plugin's fence: ```json (plain) or ```compressed-json (LZ, base64,
  // wrapped at fixed width). Anywhere in the body — the plugin puts it under
  // `## Drawing` inside a `%%` comment, but an owner who moved it is not
  // wrong.
  const fence = /```(compressed-json|json)\r?\n([\s\S]*?)\r?\n```/.exec(body);
  if (!fence) {
    // A brand-new plugin note the owner made by hand, or one the plugin has
    // not written to yet: an empty scene it may fill.
    if (/excalidraw-plugin:/.test(frontmatter ?? "")) {
      return { format: "plugin", compressed: false, scene: emptyScene(), frontmatter };
    }
    return null;
  }
  const compressed = fence[1] === "compressed-json";
  let text = fence[2];
  if (compressed) {
    const packed = text.replace(/\s+/g, "");
    const out = decompressFromBase64(packed);
    if (out === null || out === "") return null;
    text = out;
  }
  try {
    const scene = sceneOf(JSON.parse(text));
    return scene === null ? null : { format: "plugin", compressed, scene, frontmatter };
  } catch {
    return null;
  }
}

/** The words in a drawing: every text element's text, one per line, with a
 *  `[[wikilink]]` written inside it left exactly as typed. This is what the
 *  indexer files for search and reads links from, and what the plugin lists
 *  under "## Text Elements" so Obsidian does the same. */
export function drawingTexts(scene: DrawingScene): string[] {
  const out: string[] = [];
  for (const el of scene.elements) {
    if (!el || typeof el !== "object") continue;
    const e = el as Record<string, unknown>;
    if (e.isDeleted === true) continue;
    if (e.type === "text" && typeof e.text === "string" && e.text.trim() !== "") out.push(e.text);
    // A link set on any shape (Excalidraw's "link" property) counts too: a
    // rectangle that points at a note is a link to that note.
    if (typeof e.link === "string" && /^\[\[.+\]\]$/.test(e.link.trim())) out.push(e.link.trim());
  }
  return out;
}

/** What the indexer files for a drawing instead of its bytes: the text
 *  elements as prose, so search finds the words on the canvas and the graph
 *  sees the links, and never the JSON that surrounds them. */
export function drawingIndexText(rel: string, content: string): string {
  const drawing = parseDrawing(rel, content);
  if (drawing === null) return "";
  const head = drawing.frontmatter === null ? "" : `---\n${drawing.frontmatter}\n---\n\n`;
  return head + drawingTexts(drawing.scene).join("\n\n") + "\n";
}

/** Write the scene back in the file's own format. A plugin file keeps its
 *  frontmatter, keeps compression if it had it, and lists the text elements
 *  where the plugin does, so Obsidian's own search and links keep working on
 *  a drawing Vellum saved. */
export function serializeDrawing(drawing: Drawing): string {
  if (drawing.format === "json") return sceneJson(drawing.scene) + "\n";
  const fm = drawing.frontmatter ?? `${PLUGIN_HEADER}\ntags: [excalidraw]`;
  const texts = drawingTexts(drawing.scene)
    .map((text, i) => `${text} ^${textElementId(drawing.scene, i)}`)
    .join("\n\n");
  const json = sceneJson(drawing.scene);
  const fenced = drawing.compressed
    ? "```compressed-json\n" + wrap(compressToBase64(json), 76) + "\n```"
    : "```json\n" + json + "\n```";
  return (
    `---\n${fm}\n---\n` +
    "==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== " +
    "You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. " +
    "For more info check in plugin settings under 'Saving'\n\n\n" +
    "# Excalidraw Data\n\n## Text Elements\n" +
    (texts === "" ? "" : texts + "\n\n") +
    "%%\n## Drawing\n" +
    fenced +
    "\n%%"
  );
}

/** The plugin tags each listed text with the element's id (`^abc123`); a
 *  scene element without one gets a stable stand-in so the line still parses. */
function textElementId(scene: DrawingScene, nth: number): string {
  let i = 0;
  for (const el of scene.elements) {
    if (!el || typeof el !== "object") continue;
    const e = el as Record<string, unknown>;
    if (e.isDeleted === true) continue;
    const counts =
      (e.type === "text" && typeof e.text === "string" && e.text.trim() !== "") ||
      (typeof e.link === "string" && /^\[\[.+\]\]$/.test(e.link.trim()));
    if (!counts) continue;
    if (i === nth) return typeof e.id === "string" && e.id !== "" ? e.id.slice(0, 8) : `t${nth}`;
    i++;
  }
  return `t${nth}`;
}

function wrap(text: string, width: number): string {
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += width) lines.push(text.slice(i, i + width));
  return lines.join("\n");
}

/** A new file's content, in the format the vault wants: the plugin's
 *  markdown when the vault is also an Obsidian vault (so the plugin opens it),
 *  plain JSON otherwise. */
export function newDrawingContent(format: DrawingFormat): string {
  return serializeDrawing({ format, compressed: false, scene: emptyScene(), frontmatter: null });
}

/** The extension a new drawing takes under each format. */
export function drawingExtension(format: DrawingFormat): string {
  return format === "plugin" ? ".excalidraw.md" : ".excalidraw";
}
