import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useDialog } from "../a11y.ts";
import { useStore } from "../state.ts";
import { search } from "../api.ts";
import { localeNum, t, tf, type I18nKey } from "../i18n.ts";
import { ensureMd, isNotePath, stripNoteExt } from "../../shared/noteFormat.ts";
import type { SearchHit } from "../../shared/types.ts";
import { renderSnippet, snippetIsEmpty } from "./snippet.tsx";
import { getLayouts } from "../api.ts";
import { restoreLayout } from "../layouts.ts";
import { loadUnique } from "../uniqueNote.ts";
import { foldTerm } from "../../shared/fold.ts";
import { installRecents, recentNotes } from "../recents.ts";
import { getNote } from "../api.ts";
import { noteAnchors, type NoteAnchor } from "../../shared/anchors.ts";
// The palette's ranking rules live in their own module so tests/palette.test.ts
// drives exactly this code rather than a second copy of the arithmetic.
import { commandCut, fuzzyMatch, rankCommands } from "../paletteRank.ts";
import { panesInOrder } from "../workspace.ts";
import { phoneShellMode } from "../state.ts";
import { COMMANDS, runPaletteCommand, runPalettePrompt, type Command, type CommandCtx } from "./palette/commands.ts";
export { COMMANDS, runPaletteCommand, runPalettePrompt } from "./palette/commands.ts";
export type { CommandCtx, Command } from "./palette/commands.ts";

// The palette owns the recents ledger's install: visits are recorded for the
// palette's sake, so the palette is the module that switches recording on —
// state.ts keeps no dependency on the feature. Module load runs once, and
// installRecents guards itself besides.
installRecents(useStore);

/** A WORD, OR NOTHING. The fuzzy matcher hands back every index it landed on,
 *  and painting all of them turned "theme" over *Open the Media page* into
 *  "**the** **Me**dia" — two fragments of two different words, lit as if the
 *  row had been found by them. A highlight is a claim about WHY this row is
 *  here, and letters scattered through a phrase cannot carry it: the row is
 *  still offered (the fuzzy match is why it ranks), just not annotated.
 *
 *  So the marks survive one shape only — a single unbroken run that begins a
 *  word. "media" lights *Media*; "open" lights *Open*; "theme" lights nothing
 *  and the row reads as plain text, which is the truth. */
function highlight(text: string, indices: number[]): ReactNode {
  if (indices.length === 0) return text;
  const from = indices[0];
  const to = indices[indices.length - 1];
  const unbroken = to - from + 1 === indices.length && indices.every((n, i) => n === from + i);
  const before = from === 0 ? "" : text[from - 1];
  const atWordStart = from === 0 || !/[\p{L}\p{N}]/u.test(before);
  if (!unbroken || !atWordStart) return text;
  return [
    text.slice(0, from),
    <mark key="hit">{text.slice(from, to + 1)}</mark>,
    text.slice(to + 1),
  ];
}

function titleOf(path: string): string {
  const base = path.split("/").pop() ?? path;
  return stripNoteExt(base);
}

/** Folder part of a vault path ("" for notes at the vault root). */
function folderOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

type Item =
  | { kind: "command"; command: Command; indices: number[] }
  | { kind: "recent"; path: string }
  | { kind: "tab"; path: string }
  | { kind: "note"; hit: SearchHit }
  | { kind: "heading"; anchor: NoteAnchor; indices: number[] }
  /** The quick switcher's last row: make the note the query names. */
  | { kind: "create"; name: string; path: string };

const SECTION_KEY: Record<Item["kind"], I18nKey> = {
  recent: "paletteRecent",
  command: "paletteCommands",
  tab: "paletteOpenTabs",
  note: "paletteNotes",
  heading: "paletteHeadings",
  create: "paletteCreate",
};

/** Where "Create «query»" puts the note: beside the open note, or exactly
 *  where a typed path says — the `[[` popup's rule (editor/autocomplete.ts
 *  createDestination), spelled here for the palette. */
function createPath(name: string, openPath: string | null): string {
  const named = ensureMd(name);
  if (name.includes("/") || openPath === null) return named;
  const folder = folderOf(openPath);
  return folder === "" ? named : `${folder}/${named}`;
}

/** One "Load layout: <name>" command per saved layout. Built per palette-open
 *  from the server's list, not at import: layouts are saved and deleted at
 *  runtime, and a table built once would offer yesterday's names. */
function layoutCommands(names: string[]): Command[] {
  return names.map((name) => ({
    id: `layout:${name}`,
    label: () => tf("cmdLoadLayout", { name }),
    hint: () => t("cmdLoadLayoutHint"),
    available: ({ admin }) => admin,
  }));
}

function IconFile() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function IconCommand() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
    </svg>
  );
}

interface Mode {
  type: "list" | "prompt";
  command?: Command;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CommandPalette() {
  const paletteOpen = useStore((s) => s.paletteOpen);
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const openTabs = useStore((s) => s.openTabs);
  const openPath = useStore((s) => s.openPath);
  const admin = useStore((s) => s.admin);
  const authProtected = useStore((s) => s.authProtected);
  const preview = useStore((s) => s.previewVisitor);
  const reading = useStore((s) => s.readingMode);
  const panes = useStore((s) => panesInOrder(s.workspace).length);
  // A boolean, not the table: the palette re-renders on every keystroke and
  // has no business subscribing to an object identity.
  const hasTwin = useStore((s) => s.openPath !== null && s.twins[s.openPath] !== undefined);
  useStore((s) => s.theme); // the flip row names the room it lands in
  useStore((s) => s.language); // re-render the chrome strings on language change
  const openPublished = useStore(
    (s) =>
      s.openPublished ??
      (s.openPath !== null && (s.publishedPaths?.has(s.openPath) ?? false)),
  );

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>({ type: "list" });
  const [selected, setSelected] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  /** SNAPSHOT of the recents ledger, taken once per palette-open. A snapshot
   *  rather than a live read on purpose: opening the palette IS a visit to
   *  wherever you are, and a list that reshuffled under the second Ctrl+P of
   *  the evening would break exactly the muscle memory it exists to serve. */
  const [recent, setRecent] = useState<string[]>([]);
  /** The open note's anchors (headings + LaTeX \labels), fetched lazily the
   *  first time the query enters heading mode ("@…"); null = not loaded. */
  const [anchors, setAnchors] = useState<NoteAnchor[] | null>(null);
  /** The saved layouts' names, fetched once per palette-open (admin only),
   *  so "Ctrl/Cmd P → Research" restores the arrangement called Research. */
  const [layouts, setLayouts] = useState<string[]>([]);
  /** True from the moment the query changes until THAT query's results are in
   *  `hits` (covers the debounce window too). While true, the note rows on
   *  screen belong to an older query and Enter must not open them. */
  const [inFlight, setInFlight] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Token of the most recently dispatched query; a response only lands if it
   *  still carries the current token. */
  const seqRef = useRef(0);
  /** Enter was pressed while results were in flight: run the selection as soon
   *  as the current query's results land. */
  const pendingEnterRef = useRef(false);
  // ---- Pointer arming -----------------------------------------------------
  // Enter must run the KEYBOARD's selection. The palette opens under wherever
  // the cursor happens to be resting, and `mouseenter` fires on whatever row
  // materializes there — so the row the reader never chose silently became the
  // one Enter ran. Hover is therefore ignored until the mouse actually MOVES:
  // we arm on a mousemove whose coordinates differ from the previous one
  // (browsers emit a synthetic move after layout/scroll changes, and one of
  // those must not count), and disarm on every keystroke, so arrowing away
  // from a stationary cursor is never undone by the cursor sitting there.
  const armedRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const onListMouseMove = useCallback((e: ReactMouseEvent) => {
    const last = lastPointRef.current;
    if (last && (last.x !== e.clientX || last.y !== e.clientY)) armedRef.current = true;
    lastPointRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Reset on open.
  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setMode({ type: "list" });
      setSelected(0);
      setHits([]);
      setInFlight(false);
      // Recents: pruned against the CURRENT tree at this read (a deleted or
      // unpublished note's path never surfaces a title), minus the note the
      // reader is looking at — "jump back to where I just was" never means
      // "here". Ten rows: enough for an evening's trail, few enough that the
      // commands stay one glance away.
      const s = useStore.getState();
      setRecent(recentNotes(s.tree, { exclude: s.openPath, limit: 10 }));
      setAnchors(null);
      seqRef.current++; // invalidate any response still in flight
      pendingEnterRef.current = false;
      armedRef.current = false;
      lastPointRef.current = null;
      // Focus after the modal renders.
      requestAnimationFrame(() => inputRef.current?.focus());
      // The rows that depend on the instance: one layout command per saved
      // name, and the unique note's hint from the settings in force. Both
      // arrive a moment after the list is up; neither is worth waiting for.
      if (s.admin) {
        getLayouts()
          .then((r) => setLayouts(r.layouts.map((l) => l.name)))
          .catch(() => setLayouts([]));
        void loadUnique();
      } else setLayouts([]);
    }
  }, [paletteOpen]);

  /** Heading mode: "@…" or "#…" jumps within the OPEN note — one palette, one
   *  more prefix, rather than a second Ctrl+Shift+O surface to learn.
   *
   *  TWO PREFIXES, ONE MODE (v1.8 audit, F21). Readers arrive from editors
   *  that disagree about which character means "heading": `#` in Obsidian's
   *  quick switcher, `@` in VS Code's symbol jump. Accepting both costs one
   *  character class and makes the placeholder — the only place this mode is
   *  ever taught — true whichever one the reader tries. A second MODE on `#`
   *  (tag filtering, say) was the alternative and is refused: the search box
   *  is where a vault is filtered, this list is where the open note is walked,
   *  and the palette does not need two answers to one keystroke.
   *
   *  Gated on a note being open, which is also the fallback that makes the
   *  choice safe: with nothing on screen to walk, `#anchor` is just a search
   *  for a tag, and it runs as one. */
  const headingModePath =
    openPath !== null && isNotePath(openPath) ? openPath : null;
  const headingMode =
    mode.type === "list" &&
    headingModePath !== null &&
    (query.startsWith("@") || query.startsWith("#"));

  // Debounced live note search while typing in list mode. Token + abort per
  // query: only the latest query's results may land in `hits`.
  useEffect(() => {
    if (!paletteOpen || mode.type !== "list") return;
    const token = ++seqRef.current;
    const q = headingMode ? "" : query.trim();
    if (!q) {
      setHits([]);
      setInFlight(false);
      return;
    }
    setInFlight(true);
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      search(q, ctrl.signal)
        .then((results) => {
          if (token !== seqRef.current) return;
          setHits(results);
          setInFlight(false);
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted || token !== seqRef.current) return;
          setHits([]);
          setInFlight(false);
          console.error("CommandPalette: search failed", err);
        });
    }, 120);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [paletteOpen, mode.type, query, headingMode]);

  // Heading mode's data: the open note's anchor table, via the API rather
  // than the live editor buffer — the palette must stay importable without
  // pulling CodeMirror into its chunk (the same wall bufferBridge.ts guards),
  // and autosave (600ms) keeps the server copy close enough that the heading
  // you typed a breath ago is the only thing that can be missing. Fetched
  // once per palette-open, on first entering "@".
  useEffect(() => {
    if (!paletteOpen || !headingMode || anchors !== null) return;
    const path = headingModePath;
    if (path === null) {
      setAnchors([]);
      return;
    }
    let dead = false;
    getNote(path)
      .then((note) => {
        if (!dead) setAnchors(noteAnchors(path, note.content));
      })
      .catch((err: unknown) => {
        console.error("CommandPalette: loading anchors failed", err);
        if (!dead) setAnchors([]);
      });
    return () => {
      dead = true;
    };
  }, [paletteOpen, headingMode, headingModePath, anchors]);

  const items = useMemo<Item[]>(() => {
    if (mode.type === "prompt") return [];
    if (headingMode) {
      // "@" then fuzzy over the open note's anchors. Empty query = the whole
      // outline in document order — the "where am I" glance for free.
      const hq = query.slice(1).trim();
      const list = anchors ?? [];
      if (!hq) return list.map<Item>((anchor) => ({ kind: "heading", anchor, indices: [] }));
      return list
        .map((anchor) => {
          const onTitle = fuzzyMatch(hq, anchor.title);
          if (onTitle) return { anchor, indices: onTitle.indices, score: onTitle.score };
          // The id is how a \label is actually remembered ("eq:fourier"), so
          // it is a haystack too — highlighting stays on the title, which is
          // what the row displays.
          const onId = fuzzyMatch(hq, anchor.id);
          return onId ? { anchor, indices: [], score: onId.score - 1 } : null;
        })
        .filter((x): x is { anchor: NoteAnchor; indices: number[]; score: number } => x !== null)
        .sort((a, b) => b.score - a.score)
        .map<Item>(({ anchor, indices }) => ({ kind: "heading", anchor, indices }));
    }
    const q = query.trim();
    const ctx: CommandCtx = {
      openPath,
      admin,
      authProtected,
      openPublished,
      preview,
      reading,
      panes,
      hasTwin,
    };
    const available = [...COMMANDS, ...layoutCommands(layouts)].filter((c) => c.available(ctx));
    if (!q) {
      // Empty palette: the notes you were just in FIRST — that is the jump a
      // writer opens Ctrl+P for — then the commands, then whatever open tabs
      // the recents section didn't already name (a duplicate row would make
      // arrow-key distances change with usage, the muscle-memory killer).
      const shown = new Set(recent);
      // Filtered BEFORE the spread: `filter(...).map<Item>` reads to the
      // check-i18n scanner like a JSX tag with English text in front of it.
      const restTabs = openTabs.filter((path) => !shown.has(path));
      return [
        ...recent.map<Item>((path) => ({ kind: "recent", path })),
        ...available.map<Item>((command) => ({
          kind: "command",
          command,
          indices: [],
        })),
        ...restTabs.map<Item>((path) => ({ kind: "tab", path })),
      ];
    }
    // THE FLOOR AND THE CAP (v1.8 audit, F18): what counts as a match, and how
    // many of them a query may put on screen. Both live in client/paletteRank.ts
    // with the reasoning and the measured numbers; the label and the searchable
    // hint are two haystacks over one row, which is why `textOf` hands over
    // both. The thunks are evaluated HERE — the table is built once at import
    // and the chrome language changes at runtime.
    const matchedCommands = rankCommands(q, available, (command) => ({
      label: command.label(),
      hint: command.hint?.(),
      aliases: command.aliases?.(),
    }));
    // WHERE THE BLOCK LANDS among the notes. `commandCut` counts the leading
    // note rows that outrank the best command; the notes themselves keep the
    // server's relevance order untouched on both sides of it.
    const cut = commandCut(q, hits.map((hit) => hit.title), matchedCommands[0]?.score ?? -Infinity);
    const noteItem = (hit: SearchHit): Item => ({ kind: "note", hit });
    // THE QUICK SWITCHER'S LAST ROW. When no note is CALLED what was typed,
    // the list ends with "Create «query»" — Obsidian's quick switcher
    // habit, and the one gesture that turns "I looked for it and it is not
    // there" into the note, without leaving the field. Last, never first:
    // Enter must keep landing on the best match while there is one. Gated
    // on an exact (folded) title miss rather than on an empty list, because
    // a vault with "Meeting notes" still has no note called "Meeting notes
    // 2", and that is the note the writer is about to want.
    // An alias counts as a name: a note with `aliases: [Start here]` IS
    // called "Start here", and the row that made it would make a twin.
    const folded = foldTerm(q);
    const named = hits.some((hit) => foldTerm(hit.title) === folded || (hit.alias !== undefined && foldTerm(hit.alias) === folded));
    const create: Item[] = admin && !named && !q.includes("#") ? [{ kind: "create", name: q, path: createPath(q, openPath) }] : [];
    return [
      ...hits.slice(0, cut).map(noteItem),
      ...matchedCommands.map<Item>(({ command, indices }) => ({ kind: "command", command, indices })),
      ...hits.slice(cut).map(noteItem),
      ...create,
    ];
  }, [mode.type, query, openPath, admin, authProtected, openPublished, preview, reading, panes, openTabs, hits, headingMode, anchors, recent, layouts]);

  // Keep selection in bounds as results change.
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, items.length - 1)));
  }, [items.length]);

  // Keep the selected row visible.
  useEffect(() => {
    listRef.current
      ?.querySelector(".s-palette-item--active")
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, items]);

  const close = useCallback(() => setPaletteOpen(false), [setPaletteOpen]);

  // Tab is trapped inside the panel, and closing hands focus back to whatever
  // opened the palette — a reader who pressed Ctrl+P from the middle of a
  // note lands back in the note, not on <body>. The palette focuses its own
  // input (see the reset effect above), hence manualFocus.
  useDialog(panelRef, { active: paletteOpen, manualFocus: true });

  const runCommand = useCallback(
    (command: Command) => {
      if (command.prompt) {
        setMode({ type: "prompt", command });
        setQuery(command.prompt.initial());
        setSelected(0);
        requestAnimationFrame(() => inputRef.current?.select());
        return;
      }
      if (command.id.startsWith("layout:")) {
        void restoreLayout(command.id.slice("layout:".length));
        close();
        return;
      }
      runPaletteCommand(command);
      close();
    },
    [close],
  );

  const submitPrompt = useCallback(() => {
    const command = mode.command;
    const value = query.trim();
    if (!command || !value) return;
    runPalettePrompt(command, value);
    close();
  }, [mode.command, query, close]);

  const execute = useCallback(
    (item: Item) => {
      if (item.kind === "command") {
        runCommand(item.command);
        return;
      }
      if (item.kind === "heading") {
        // The same event the outline's rows dispatch, with the same payload
        // (TocPanel): the editor consumes `line`, the reading view `slug`, so
        // one dispatch lands in whichever surface is showing the note. No
        // pendingHeading — that is for a note that is about to MOUNT, and
        // this note is on screen behind the palette right now.
        window.dispatchEvent(
          new CustomEvent("astrolabe:goto-heading", {
            detail: { slug: item.anchor.id, line: item.anchor.line, text: item.anchor.title },
          }),
        );
        close();
        return;
      }
      if (item.kind === "create") {
        // The store's createNote: the default template, the tree reload,
        // the open — the note is born exactly as a Ctrl/Cmd N note is.
        void useStore.getState().createNote(item.path);
        close();
        return;
      }
      const path = item.kind === "note" ? item.hit.path : item.path;
      useStore.getState().openNote(path);
      close();
    },
    [runCommand, close],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      // Any keystroke hands the selection back to the keyboard: a cursor
      // parked over row 5 must not re-steal it after ↓ moved to row 2.
      armedRef.current = false;
      lastPointRef.current = null;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (mode.type === "prompt") {
        if (e.key === "Enter") {
          e.preventDefault();
          submitPrompt();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => (items.length ? (s + 1) % items.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) =>
          items.length ? (s - 1 + items.length) % items.length : 0,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = items[selected];
        // Never open a stale row: while a search is in flight the note rows
        // belong to an older query, so Enter registers intent and fires when
        // THIS query's results land. Commands/tabs are matched synchronously
        // against the current query and stay safe to run immediately.
        // The create row waits as well: it exists only because no note is
        // called what was typed, and that is a fact the in-flight search
        // has not confirmed yet.
        if (inFlight && (!item || item.kind === "note" || item.kind === "create")) {
          pendingEnterRef.current = true;
          return;
        }
        if (item) execute(item);
      }
    },
    [mode.type, items, selected, inFlight, close, execute, submitPrompt],
  );

  // Deferred Enter: fires once the in-flight query's results have landed.
  useEffect(() => {
    if (inFlight || !pendingEnterRef.current) return;
    pendingEnterRef.current = false;
    if (!paletteOpen || mode.type !== "list") return;
    const item = items[Math.min(selected, items.length - 1)];
    if (item) execute(item);
  }, [inFlight, paletteOpen, mode.type, items, selected, execute]);

  if (!paletteOpen) return null;

  const isPrompt = mode.type === "prompt";

  return (
    <div className="s-palette-overlay" onMouseDown={close}>
      <div
        ref={panelRef}
        className="s-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t("keyPalette")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isPrompt && mode.command && (
          <div className="s-palette-prompt-label">{mode.command.label()}</div>
        )}
        {/* The palette IS a combobox: a text field whose arrow keys drive a
            list of options that live somewhere else in the DOM. Said out
            loud, that is exactly the role/aria-controls/aria-activedescendant
            trio — without it a screen reader announces the typing and nothing
            about what is selected underneath. */}
        <input
          ref={inputRef}
          className="s-palette-input"
          type="text"
          // The field holds note-derived text — a title being searched for, a
          // vault path being edited — so its DIRECTION is the value's, not the
          // chrome's. In an Arabic shell the rename prompt opened pre-filled
          // with "1 - Source Material/Research Page.md" and DREW it as
          // "Source Material/Research Page.md - 1": the leading digits are
          // bidi-weak, so the RTL paragraph swept them to the far end. That is
          // the string the reader is about to rename a file to.
          // While the field is EMPTY it carries no direction of its own and
          // inherits the shell's, so the Arabic placeholder still sets
          // right-aligned: `dir="auto"` reads the VALUE, and an empty one
          // resolves to ltr, which left-aligned «اكتب أمرًا أو ابحث في
          // الملاحظات…» inside an RTL panel.
          dir={query === "" ? undefined : "auto"}
          role={isPrompt ? undefined : "combobox"}
          aria-expanded={isPrompt ? undefined : items.length > 0}
          aria-controls={isPrompt ? undefined : "s-palette-list"}
          aria-autocomplete={isPrompt ? undefined : "list"}
          aria-activedescendant={
            !isPrompt && items[selected] ? `s-palette-opt-${selected}` : undefined
          }
          aria-label={isPrompt ? mode.command?.label() : t("keyPalette")}
          value={query}
          placeholder={
            isPrompt
              ? mode.command?.id === "ask-vault"
                ? t("askPlaceholder")
                : mode.command?.prompt?.placeholder
              : // A phone's field holds about thirty characters; the long
                // sentence was cut at "for a headin". The palette is a layer
                // of the phone shell there (client/phone/PhoneShell.tsx).
                phoneShellMode()
                ? t("palettePlaceholderShort")
                : t("palettePlaceholder")
          }
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0); // a new query is a new list — selection starts at the top
            pendingEnterRef.current = false; // typing again cancels a queued Enter
            armedRef.current = false;
            lastPointRef.current = null;
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
        />
        {!isPrompt && (
          <>
            {/* The count, spoken. The list repopulates on every keystroke and
                a screen reader is told nothing by the typing alone. */}
            <p className="s-sr-only" role="status">
              {items.length === 0
                ? t("noResultsAria")
                : tf("resultCount", { count: localeNum(items.length) })}
            </p>
            <div
              className="s-palette-list"
              id="s-palette-list"
              role="listbox"
              aria-label={t("paletteResultsAria")}
              ref={listRef}
              onMouseMove={onListMouseMove}
            >
            {items.map((item, i) => {
              const active = i === selected;
              const cls = `s-palette-item${active ? " s-palette-item--active" : ""}`;
              const key =
                item.kind === "command"
                  ? `cmd:${item.command.id}`
                  : item.kind === "recent"
                    ? `recent:${item.path}`
                    : item.kind === "tab"
                      ? `tab:${item.path}`
                      : item.kind === "heading"
                        ? `head:${item.anchor.id}`
                        : item.kind === "create"
                          ? `create:${item.path}`
                          : `note:${item.hit.path}`;
              const heading =
                items[i - 1]?.kind !== item.kind ? (
                  <div className="s-palette-section" role="presentation">
                    {t(SECTION_KEY[item.kind])}
                  </div>
                ) : null;
              return (
                // A listbox may only own options (and groups), so the grouping
                // wrappers and the section captions step out of the tree.
                <div key={key} role="presentation">
                  {heading}
                  <div
                    className={cls}
                    id={`s-palette-opt-${i}`}
                    role="option"
                    aria-selected={active}
                    // onMouseMove, not onMouseEnter: the palette opens under a
                    // stationary cursor, and `mouseenter` on whichever row
                    // lands beneath it would move the selection the reader
                    // never touched. Genuine movement arms it (see
                    // onListMouseMove); every keystroke disarms it again.
                    onMouseMove={() => {
                      if (armedRef.current) setSelected(i);
                    }}
                    onClick={() => execute(item)}
                  >
                    <span className="s-palette-item-icon" aria-hidden="true">
                      {item.kind === "command" ? (
                        item.command.themeDot ? (
                          <span
                            className="s-palette-dot"
                            data-theme-dot={item.command.themeDot()}
                          />
                        ) : (
                          <IconCommand />
                        )
                      ) : (
                        <IconFile />
                      )}
                    </span>
                    {item.kind === "command" && (
                      <>
                        <span className="s-palette-item-title">
                          {highlight(item.command.label(), item.indices)}
                        </span>
                        {item.command.hint && (
                          <span className="s-palette-item-hint">
                            {/* Hints are a mixed bag — localized words
                                ("appearance" / «المظهر»), keystrokes
                                ("Ctrl/Cmd Alt Shift B") and a real vault path
                                (the daily note's). The last two are Latin
                                runs with weak leading characters, so each
                                hint isolates itself rather than reordering
                                against the Arabic row around it. */}
                            <bdi>{item.command.hint()}</bdi>
                          </span>
                        )}
                      </>
                    )}
                    {(item.kind === "tab" || item.kind === "recent") && (
                      <>
                        <span className="s-palette-item-title" dir="auto">
                          {titleOf(item.path)}
                        </span>
                        {folderOf(item.path) && (
                          <span className="s-palette-item-path" dir="auto">
                            {folderOf(item.path)}
                          </span>
                        )}
                      </>
                    )}
                    {item.kind === "heading" && (
                      <>
                        <span className="s-palette-item-title" dir="auto">
                          {highlight(item.anchor.title, item.indices)}
                        </span>
                        {/* A \label's id IS its name ("eq:fourier"); a
                            heading's id merely restates the title as a slug,
                            which would be noise on every row. */}
                        {item.anchor.kind !== "heading" && (
                          <span className="s-palette-item-path" dir="auto">
                            {item.anchor.id}
                          </span>
                        )}
                      </>
                    )}
                    {item.kind === "create" && (
                      <>
                        <span className="s-palette-item-title" dir="auto">
                          {tf("linkCreateNote", { name: item.name })}
                        </span>
                        {/* Where the file will LAND, spelled out — the
                            `[[` popup's courtesy, kept here. */}
                        <span className="s-palette-item-path" dir="auto">
                          {tf("promptCreates", { path: item.path })}
                        </span>
                      </>
                    )}
                    {item.kind === "note" && (
                      <>
                        <span className="s-palette-item-title" dir="auto">
                          {item.hit.title}
                        </span>
                        {!snippetIsEmpty(item.hit.snippet) && (
                          <span className="s-palette-item-snippet" dir="auto">
                            {renderSnippet(item.hit.snippet)}
                          </span>
                        )}
                        {folderOf(item.hit.path) && (
                          <span className="s-palette-item-path" dir="auto">
                            {folderOf(item.hit.path)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {items.length === 0 && (
              // THE RESCUE, NOT THE REPORT (v1.8 audit, F21). "No matches" was
              // the whole of this block, and the reader who has just been told
              // the vault has nothing is the reader most likely to have been
              // reaching for a heading in the note already on screen — the one
              // mode the palette never advertised. The hint only appears where
              // it can be acted on: with no note open there is no outline to
              // walk, and a prefix that does nothing is worse than silence.
              <div className="s-palette-empty" role="presentation">
                {t("paletteNoMatches")}
                {headingModePath !== null && !headingMode && (
                  <span className="s-palette-empty__hint">{t("paletteModeHint")}</span>
                )}
              </div>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
