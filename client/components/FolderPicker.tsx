// "Choose a folder" — the vault's folders laid out to click, for any field
// that wants one.
//
// The library's paths editor is the first caller: a path IS a folder, and a
// text field that expects "1 - Source Material/Books/Feynman Lectures" typed
// by hand is a test the reader did not sign up for. So the field became a
// button, and the button opens this: every folder of the vault, filterable,
// with its parent printed faint on the trailing side, Enter to take one.
//
// It is the move picker's dialog (MovePicker.tsx) with the moving taken out:
// same root-on-demand mounting, same palette shape, same keys, same styles —
// `.s-movepick` is reused rather than copied so the two can never drift apart.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { t } from "../i18n.ts";
import { allFolders, parentDir } from "../move.ts";
import { attachScrollFade } from "../scrollFade.ts";
import { useStore } from "../state.ts";
import "../styles/move.css";

interface Row {
  path: string;
  name: string;
  parent: string;
}

export interface FolderPickOptions {
  /** The dialog's heading, already in the reader's language. */
  title: string;
  /** The folder the field holds now; ringed in the list and the default
   *  highlight. */
  current?: string | null;
}

function FolderPickerPanel({ options, onDone }: { options: FolderPickOptions; onDone(path: string | null): void }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rows = useMemo<Row[]>(() => {
    const tree = useStore.getState().tree;
    return allFolders(tree).map((path) => ({
      path,
      name: path.slice(path.lastIndexOf("/") + 1),
      parent: parentDir(path),
    }));
  }, []);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.path.toLowerCase().includes(q));
  }, [rows, query]);
  const [selected, setSelected] = useState(() => Math.max(0, rows.findIndex((r) => r.path === options.current)));

  useEffect(() => {
    inputRef.current?.focus();
    listRef.current?.querySelector(".s-movepick__row--active")?.scrollIntoView({ block: "center" });
    if (listRef.current) return attachScrollFade(listRef.current);
  }, []);

  useEffect(() => {
    setSelected((at) => (at < shown.length ? at : 0));
  }, [shown.length]);

  useEffect(() => {
    listRef.current?.querySelector(".s-movepick__row--active")?.scrollIntoView({ block: "nearest" });
  }, [selected, shown]);

  const commit = useCallback(
    (at: number) => {
      const row = shown[at];
      if (row) onDone(row.path);
    },
    [onDone, shown],
  );

  // Capture phase, like the confirm dialog: while this is open it outranks
  // the settings modal's own Escape and every editor binding.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onDone(null);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelected((at) => (shown.length ? (at + 1) % shown.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelected((at) => (shown.length ? (at - 1 + shown.length) % shown.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        commit(selected);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [shown, selected, commit, onDone]);

  return (
    <div className="s-confirm-overlay" onMouseDown={() => onDone(null)}>
      <div
        className="s-movepick"
        role="dialog"
        aria-modal="true"
        aria-label={options.title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="s-movepick__title" dir="auto">
          {options.title}
        </h2>
        <input
          ref={inputRef}
          className="s-movepick__input"
          type="text"
          dir="auto"
          value={query}
          placeholder={t("folderPickFilter")}
          aria-label={t("folderPickFilter")}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="s-movepick__list s-scrollfade" ref={listRef} role="listbox" aria-label={t("folderPickFilter")}>
          {shown.map((row, i) => (
            <button
              key={row.path}
              type="button"
              role="option"
              aria-selected={i === selected}
              className={`s-movepick__row${i === selected ? " s-movepick__row--active" : ""}${
                row.path === options.current ? " s-movepick__row--current" : ""
              }`}
              onMouseMove={() => setSelected(i)}
              onClick={() => commit(i)}
            >
              <span className="s-movepick__name" dir="auto">{row.name}</span>
              {row.parent && (
                <span className="s-movepick__parent" dir="auto">{row.parent}</span>
              )}
            </button>
          ))}
          {shown.length === 0 && (
            <p className="s-movepick__none">{rows.length === 0 ? t("folderPickNone") : t("moveNoFolders")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

let closeOpen: (() => void) | null = null;

/** Ask for a folder of the vault. Resolves with its vault-relative path, or
 *  null when the reader backed out. */
export function pickFolder(options: FolderPickOptions): Promise<string | null> {
  closeOpen?.();
  return new Promise<string | null>((resolve) => {
    const host = document.createElement("div");
    host.className = "s-movepick-host";
    document.body.appendChild(host);
    const root = createRoot(host);
    let settled = false;
    const done = (path: string | null): void => {
      if (settled) return;
      settled = true;
      if (closeOpen === cancel) closeOpen = null;
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
      resolve(path);
    };
    const cancel = (): void => done(null);
    closeOpen = cancel;
    root.render(<FolderPickerPanel options={options} onDone={done} />);
  });
}
