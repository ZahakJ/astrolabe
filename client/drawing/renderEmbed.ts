// The owner's fallback for a drawing embed whose exported picture is not on
// disk yet — a drawing made in Obsidian, or one saved by a build before the
// export existed. Draws the scene with Excalidraw's own exporter, in this
// chunk, which only the owner ever loads: a visitor's page shows the exported
// svg or nothing, because the drawing is not theirs to render.
import "./assetPath.ts";
import { exportToSvg, getNonDeletedElements } from "@excalidraw/excalidraw";
import { getNote } from "../api.ts";
import { parseDrawing } from "../../shared/drawing.ts";

/** Draw `path`'s scene into an <svg>, or null when it cannot be read. */
export async function renderDrawingSvg(path: string, dark: boolean): Promise<SVGSVGElement | null> {
  const note = await getNote(path);
  const drawing = parseDrawing(path, note.content);
  if (drawing === null) return null;
  return exportToSvg({
    // exportToSvg wants Excalidraw's element type; the scene holds them as
    // opaque values and the exporter validates what it is given.
    elements: getNonDeletedElements(drawing.scene.elements as never),
    appState: {
      ...(drawing.scene.appState as object),
      exportBackground: true,
      exportWithDarkMode: dark,
      exportEmbedScene: false,
    } as never,
    files: drawing.scene.files as never,
    exportPadding: 16,
  });
}
