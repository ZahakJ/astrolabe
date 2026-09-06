// A drawing in a pane: Excalidraw over a file in the vault.
//
// The canvas is Excalidraw's, whole — the owner asked for "a cooler, better
// version of excalidraw" and the honest answer is Excalidraw itself, wearing
// Vellum's theme and language, saving into the vault the way a note saves, and
// leaving a picture beside the file so every other surface (the reading view,
// the blog, a visitor's page) shows the drawing without ever loading this
// chunk. This file owns exactly that seam: load, autosave under the mtime
// precondition every note save carries, the conflict strip when the file moved
// under us, and the svg export on every save. Nothing here draws.
import "./assetPath.ts";
import "@excalidraw/excalidraw/index.css";
import "../styles/drawing.css";
import { Excalidraw, MainMenu, exportToSvg, getNonDeletedElements, getSceneVersion, serializeAsJSON } from "@excalidraw/excalidraw";
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { flushNoteBeacon, getNote, isStaleWriteError, putDrawingSvg, putNote } from "../api.ts";
import { resolveBaseTheme } from "../design/customThemes.ts";
import { t, tf } from "../i18n.ts";
import { markSelfWrite, useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { parseDrawing, serializeDrawing, type Drawing, type DrawingScene } from "../../shared/drawing.ts";
import { noteTitleOf } from "../../shared/noteFormat.ts";
import { themeGroup } from "../../shared/themes.ts";

type ExcalidrawProps = ComponentProps<typeof Excalidraw>;
type Api = Parameters<NonNullable<ExcalidrawProps["excalidrawAPI"]>>[0];
type OnChange = NonNullable<ExcalidrawProps["onChange"]>;
type Elements = Parameters<OnChange>[0];
type AppState = Parameters<OnChange>[1];
type Files = Parameters<OnChange>[2];

/** A keystroke's worth of quiet before a save, the same pause the editor
 *  keeps: a stroke in progress is many change events, and the file should
 *  take the stroke, not its frames. */
const SAVE_MS = 900;

type Status = "clean" | "dirty" | "saving" | "saved" | "conflict";

interface Pending {
  elements: Elements;
  appState: AppState;
  files: Files;
}

/** The scene as Excalidraw itself would write it: `serializeAsJSON` strips
 *  the session state (selection, collaborators, the open menu) and keeps what
 *  a file should keep, so we do not maintain our own list of which appState
 *  keys are a fact about the drawing. */
function sceneOf(p: Pending): DrawingScene {
  const parsed = JSON.parse(serializeAsJSON(p.elements, p.appState, p.files, "local")) as DrawingScene;
  return { elements: parsed.elements ?? [], appState: parsed.appState ?? {}, files: parsed.files ?? {} };
}

export default function DrawingSurface({ path, active }: { path: string; active: boolean }) {
  const theme = useStore((s) => s.theme);
  const language = useStore((s) => s.language);
  const dark = themeGroup(resolveBaseTheme(theme)) === "dark";
  const [initial, setInitial] = useState<ExcalidrawProps["initialData"] | null>(null);
  // WHERE THE CANVAS IS, for the dialogs. Excalidraw portals its modals (the
  // export dialog, help) into a container it appends to <body>, sized to the
  // whole window, so the dialog centred on the WINDOW while the canvas sat
  // between the sidebar and the panel — "very off centre", the owner said.
  // The canvas publishes its own box as CSS variables on the root, and
  // drawing.css pins that container to it, so a dialog opens over the
  // canvas and the sidebar stays uncovered. The last canvas touched wins,
  // which is the one whose dialog is about to open.
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const publishBox = useCallback((): void => {
    const el = canvasRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const root = document.documentElement.style;
    root.setProperty("--s-drawing-x", `${Math.round(r.left)}px`);
    root.setProperty("--s-drawing-y", `${Math.round(r.top)}px`);
    root.setProperty("--s-drawing-w", `${Math.round(r.width)}px`);
    root.setProperty("--s-drawing-h", `${Math.round(r.height)}px`);
  }, []);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    publishBox();
    const ro = new ResizeObserver(publishBox);
    ro.observe(el);
    window.addEventListener("resize", publishBox);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", publishBox);
    };
  }, [publishBox]);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<Status>("clean");
  const apiRef = useRef<Api | null>(null);
  /** What the file is on disk: its spelling, and the mtime a save must match. */
  const fileRef = useRef<{ drawing: Drawing; mtimeMs: number } | null>(null);
  const savedVersionRef = useRef(-1);
  const pendingRef = useRef<Pending | null>(null);
  const timerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  /** The status as a ref too: the save's `finally` and onChange read it
   *  after awaits, where a closure's copy would be stale. */
  const statusRef = useRef<Status>("clean");
  const setStatusBoth = (next: Status): void => {
    statusRef.current = next;
    setStatus(next);
  };

  const load = useCallback(async (): Promise<Drawing | null> => {
    const note = await getNote(path);
    const drawing = parseDrawing(path, note.content);
    if (drawing === null) return null;
    fileRef.current = { drawing, mtimeMs: note.mtimeMs };
    savedVersionRef.current = getSceneVersion(drawing.scene.elements as never);
    return drawing;
  }, [path]);

  // First load: the file becomes Excalidraw's initialData. `theme` comes off
  // the stored appState because the prop below decides it, from Vellum's own
  // room, and a drawing saved in the dark must not open dark on a light day.
  useEffect(() => {
    let alive = true;
    void load()
      .then((drawing) => {
        if (!alive) return;
        if (drawing === null) {
          setFailed(true);
          return;
        }
        const { theme: _theme, ...appState } = drawing.scene.appState as { theme?: unknown } & Record<string, unknown>;
        setInitial({
          elements: drawing.scene.elements as never,
          appState: appState as never,
          files: drawing.scene.files as never,
          scrollToContent: true,
        });
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [load]);

  /** Write the pending scene. On a stale-file refusal the scene stays pending
   *  and the strip asks; nothing drawn is ever dropped. */
  const save = useCallback(
    async (force: boolean): Promise<void> => {
      const pending = pendingRef.current;
      const file = fileRef.current;
      if (pending === null || file === null || savingRef.current) return;
      // A pending scene identical to the saved one (a deselect, a pan) is
      // nothing to write; saying "saved" is the truth about it.
      if (!force && getSceneVersion(pending.elements) === savedVersionRef.current) {
        pendingRef.current = null;
        setStatusBoth("saved");
        return;
      }
      savingRef.current = true;
      setStatusBoth("saving");
      const scene = sceneOf(pending);
      const next: Drawing = { ...file.drawing, scene };
      const content = serializeDrawing(next);
      try {
        markSelfWrite(path);
        const written = await putNote(path, content, force ? undefined : file.mtimeMs);
        fileRef.current = { drawing: next, mtimeMs: written.mtimeMs };
        savedVersionRef.current = getSceneVersion(pending.elements);
        if (pendingRef.current === pending) pendingRef.current = null;
        setStatusBoth(pendingRef.current === null ? "saved" : "dirty");
        // The picture beside the file, drawn from what was just saved. Light
        // always: the export is an attachment every theme shows, and the
        // reading view tints nothing. A failure here is a missing picture
        // until the next save, never a lost stroke, so it only logs.
        try {
          const svg = await exportToSvg({
            elements: getNonDeletedElements(pending.elements),
            appState: { ...pending.appState, exportBackground: true, exportWithDarkMode: false, exportEmbedScene: false },
            files: pending.files,
            exportPadding: 16,
          });
          await putDrawingSvg(path, svg.outerHTML);
        } catch (err) {
          console.warn("vellum: drawing export failed", err);
        }
      } catch (err) {
        if (isStaleWriteError(err)) {
          setStatusBoth("conflict");
        } else {
          setStatusBoth("dirty");
          toast(t("drawingSaveFailed"), "error");
        }
      } finally {
        savingRef.current = false;
        // A stroke that landed while the save was in flight is the next save.
        if (pendingRef.current !== null && statusRef.current !== "conflict") schedule();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path],
  );

  const schedule = useCallback((): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void save(false);
    }, SAVE_MS);
  }, [save]);

  const onChange = useCallback<OnChange>(
    (elements, appState, files) => {
      if (fileRef.current === null) return;
      // Excalidraw reports every pointer move and every menu toggle; only a
      // scene that differs from the one on disk is worth a write.
      if (getSceneVersion(elements) === savedVersionRef.current) return;
      pendingRef.current = { elements, appState, files };
      if (statusRef.current === "conflict") return;
      setStatusBoth("dirty");
      schedule();
    },
    [schedule],
  );

  // The tab closes, the pane goes, the window unloads: whatever is pending
  // goes out on the beacon, precondition included — a last-gasp save that
  // clobbers a newer file is still a clobber.
  useEffect(() => {
    const flush = (): void => {
      const pending = pendingRef.current;
      const file = fileRef.current;
      if (pending === null || file === null) return;
      const content = serializeDrawing({ ...file.drawing, scene: sceneOf(pending) });
      flushNoteBeacon(path, content, file.mtimeMs);
      pendingRef.current = null;
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      flush();
    };
  }, [path]);

  const keepMine = (): void => {
    setStatusBoth("dirty");
    void save(true);
  };
  const takeTheirs = (): void => {
    pendingRef.current = null;
    void load().then((drawing) => {
      if (drawing === null || apiRef.current === null) return;
      const { theme: _theme, ...appState } = drawing.scene.appState as { theme?: unknown } & Record<string, unknown>;
      apiRef.current.updateScene({ elements: drawing.scene.elements as never, appState: appState as never });
      setStatusBoth("clean");
    });
  };

  const title = noteTitleOf(path);
  if (failed) {
    return (
      <div className="s-drawing s-drawing--failed" role="region" aria-label={tf("drawingAria", { title })}>
        <p className="s-drawing__failed">{t("drawingLoadFailed")}</p>
      </div>
    );
  }
  return (
    <div className="s-drawing" role="region" aria-label={tf("drawingAria", { title })} data-active={active ? "true" : "false"}>
      {status === "conflict" && (
        <div className="s-drawing__conflict" role="alert">
          <span>{t("drawingConflict")}</span>
          <button type="button" className="s-btn" onClick={keepMine}>
            {t("drawingKeepMine")}
          </button>
          <button type="button" className="s-btn" onClick={takeTheirs}>
            {t("drawingTakeTheirs")}
          </button>
        </div>
      )}
      <div className="s-drawing__canvas" ref={canvasRef} onPointerDownCapture={publishBox} onFocusCapture={publishBox}>
        {initial !== null && (
          <Excalidraw
            initialData={initial}
            theme={dark ? "dark" : "light"}
            langCode={language === "ar" ? "ar-SA" : "en"}
            onChange={onChange}
            excalidrawAPI={(api) => {
              apiRef.current = api;
            }}
            UIOptions={{
              // The file IS the scene: loading another one over it or "saving
              // to disk" would be a second, silent save path.
              canvasActions: { loadScene: false, saveToActiveFile: false, export: false },
            }}
          >
            {/* Our own menu: the package's default carries its socials (GitHub,
                X, Discord) and a theme toggle; the theme is Vellum's and the
                links are Excalidraw's, so the menu keeps only the verbs a
                drawing in a vault has a use for. */}
            <MainMenu>
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.SearchMenu />
              <MainMenu.DefaultItems.CommandPalette />
              <MainMenu.DefaultItems.Help />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </MainMenu>
          </Excalidraw>
          
        )}
      </div>
      <div className={`s-drawing__status s-drawing__status--${status}`} aria-live="polite">
        {status === "saving" ? t("drawingSaving") : status === "dirty" ? t("drawingUnsaved") : status === "saved" ? t("drawingSaved") : ""}
      </div>
    </div>
  );
}
