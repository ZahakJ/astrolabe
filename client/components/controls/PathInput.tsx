// A text field for a VAULT PATH that offers the vault's own answers.
//
// A cover field that expects "attachments/cover.jpg" typed from memory is a
// test nobody passes; the vault knows every image it holds. So this is the
// plain TextInput with a list under it: type, and the paths that contain
// what you typed appear (images for a cover, notes for a note), arrow keys
// and Enter take one, Escape and blur put the list away. A URL still works —
// the list simply has nothing to say about it. Images show a thumbnail in
// the row, because a filename is a poor way to recognise a picture.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { TreeNode } from "../../../shared/types.ts";
import { bannerSrc } from "../../banner.ts";
import { t } from "../../i18n.ts";
import { useStore } from "../../state.ts";

export type PathKind = "image" | "note" | "attachment";

function collect(tree: TreeNode | null, kind: PathKind): string[] {
  const out: string[] = [];
  const walk = (node: TreeNode): void => {
    for (const child of node.children ?? []) {
      if (child.type === "folder") {
        walk(child);
        continue;
      }
      if (kind === "note" ? !child.attachment : kind === "image" ? child.attachment?.kind === "image" : !!child.attachment) {
        out.push(child.path);
      }
    }
  };
  if (tree) walk(tree);
  return out;
}

const MAX_ROWS = 8;

export function PathInput({
  value,
  onChange,
  kind,
  placeholder,
  disabled,
  label,
  maxLength,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  kind: PathKind;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  maxLength?: number;
  id?: string;
}) {
  const tree = useStore((s) => s.tree);
  const all = useMemo(() => collect(tree, kind), [tree, kind]);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rows = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (/^https?:\/\//.test(q)) return [];
    const words = q.split(/\s+/).filter(Boolean);
    const hits = all.filter((p) => {
      const low = p.toLowerCase();
      return words.every((w) => low.includes(w));
    });
    // The ones whose NAME starts with the words first, then the rest.
    const starts = (p: string) => words.length > 0 && p.slice(p.lastIndexOf("/") + 1).toLowerCase().startsWith(words[0]);
    return hits.sort((a, b) => Number(starts(b)) - Number(starts(a))).slice(0, MAX_ROWS);
  }, [all, value]);
  useEffect(() => {
    setAt(0);
  }, [rows.length, value]);

  const pick = (path: string): void => {
    onChange(path);
    setOpen(false);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (!open || rows.length === 0) {
      if (e.key === "ArrowDown" && rows.length) setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAt((i) => (i + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAt((i) => (i - 1 + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(rows[at]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
    }
  };
  const showList = open && rows.length > 0 && !disabled;
  // A preview only for a value the vault (or the web) can actually show:
  // half a typed name is not a picture and must not fetch as one.
  const known = value.trim();
  const preview = kind === "image" && known && (/^https:\/\//i.test(known) || all.includes(known)) ? bannerSrc(known) : "";
  return (
    <div
      ref={wrapRef}
      className={`s-ctl-path${showList ? " s-ctl-path--open" : ""}`}
      onBlur={(e) => {
        if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="s-ctl-path__field">
        {preview && <img className="s-ctl-path__preview" src={preview} alt="" onError={(e) => ((e.target as HTMLImageElement).hidden = true)} />}
        <input
          className="s-ctl s-ctl-input"
          type="text"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          id={id}
          aria-label={id ? undefined : label}
          aria-autocomplete="list"
          aria-expanded={showList}
          dir="ltr"
          maxLength={maxLength}
          spellCheck={false}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKey}
        />
      </div>
      {showList && (
        <ul className="s-ctl-path__list" role="listbox" aria-label={t("pathSuggestions")}>
          {rows.map((path, i) => (
            <li key={path}>
              <button
                type="button"
                role="option"
                aria-selected={i === at}
                className={`s-ctl-path__row${i === at ? " s-ctl-path__row--on" : ""}`}
                onMouseMove={() => setAt(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(path)}
              >
                {kind === "image" && <img className="s-ctl-path__thumb" src={bannerSrc(path)} alt="" loading="lazy" />}
                <span className="s-ctl-path__name">{path.slice(path.lastIndexOf("/") + 1)}</span>
                {path.includes("/") && <span className="s-ctl-path__dir">{path.slice(0, path.lastIndexOf("/"))}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
