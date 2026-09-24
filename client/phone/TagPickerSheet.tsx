// THE TAG PICKER, as a sheet. Two doors, one list.
//
//   · FOR A NOTE (the note sheet's Properties → Tags): every tag in the vault,
//     the note's own ticked, a field that filters them and offers "Add #x"
//     for a tag the vault has not seen. A tap writes at once — the note's
//     `tags:` list in its frontmatter, through the same `POST /api/frontmatter`
//     the properties card uses — because a sheet of checkboxes with a Save
//     button under them is a form, and a phone has no room for a form's
//     second step.
//   · TO BROWSE (the Notes root's "All tags" chip): the same list, and a tap
//     opens that tag's notes. The chip row shows the twenty-four busiest; this
//     is where the other four hundred are.
//
// Opens at half height, the field above the list; a drag up gives the list
// the screen.

import { useEffect, useMemo, useRef, useState } from "react";
import type { TagCount } from "../../shared/types.ts";
import { splitFrontmatter } from "../../shared/noteParse.ts";
import { getTags } from "../api.ts";
import { parseProps } from "../editor/noteMeta.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { noteContent } from "../sectionActions.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { usePhone } from "./context.ts";
import { IconCheck } from "./icons.tsx";
import { TAG_SHEET } from "./sheetIds.ts";
import Sheet from "./Sheet.tsx";

export type TagPick = { mode: "note"; path: string } | { mode: "browse" };

/** A tag as a reader types it: no `#`, no spaces at the ends. */
function clean(raw: string): string {
  return raw.trim().replace(/^#+/, "").trim();
}

const TAG_OK = /^[\p{L}\p{N}][\p{L}\p{N}_/-]*$/u;

export default function TagPickerSheet({ leaving }: { leaving: boolean }) {
  const phone = usePhone();
  const pick = phone.sheetData(TAG_SHEET) as TagPick | undefined;
  useStore((s) => s.language);
  const [all, setAll] = useState<TagCount[] | null>(null);
  const [mine, setMine] = useState<string[] | null>(pick?.mode === "note" ? null : []);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let live = true;
    getTags()
      .then((list) => live && setAll(list.slice().sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))))
      .catch(() => live && setAll([]));
    if (pick?.mode === "note") {
      noteContent(pick.path)
        .then((content) => {
          if (!live) return;
          const row = parseProps(splitFrontmatter(content).frontmatter).find((r) => r.key.toLowerCase() === "tags");
          setMine(row ? row.values.map(clean).filter(Boolean) : []);
        })
        .catch(() => live && setMine([]));
    }
    return () => {
      live = false;
    };
    // The sheet's data is fixed for its life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = clean(query).toLowerCase();
  const shown = useMemo(() => {
    const list = all ?? [];
    return q === "" ? list : list.filter((tg) => tg.tag.toLowerCase().includes(q));
  }, [all, q]);
  const fresh = q !== "" && TAG_OK.test(clean(query)) && !(all ?? []).some((tg) => tg.tag.toLowerCase() === q) && !(mine ?? []).some((m) => m.toLowerCase() === q);

  if (!pick) return null;

  const write = async (next: string[]): Promise<void> => {
    if (pick.mode !== "note" || busy) return;
    const before = mine;
    setMine(next);
    setBusy(true);
    try {
      await useStore.getState().setProperty(pick.path, "tags", next.length === 0 ? null : { kind: "list", items: next });
    } catch {
      setMine(before);
      toast(t("phTagFailed"), "error");
    } finally {
      setBusy(false);
    }
  };
  const has = (tag: string): boolean => (mine ?? []).some((m) => m.toLowerCase() === tag.toLowerCase());
  const toggle = (tag: string): void => {
    if (pick.mode === "browse") {
      phone.closeSheet(TAG_SHEET);
      phone.open({ kind: "tag", tag });
      return;
    }
    void write(has(tag) ? (mine ?? []).filter((m) => m.toLowerCase() !== tag.toLowerCase()) : [...(mine ?? []), tag]);
  };

  const title = pick.mode === "note" ? t("phTagsForNote") : t("tags");
  return (
    <Sheet
      label={title}
      detent="half"
      side={phone.tablet}
      leaving={leaving}
      onDismiss={() => phone.closeSheet(TAG_SHEET)}
      className="s-ph-tagsheet"
      header={
        <>
          <h2 className="s-ph-sheet__title">{title}</h2>
          <input
            ref={field}
            className="s-ph-field s-ph-tagsheet__field"
            type="search"
            dir={query === "" ? undefined : "auto"}
            value={query}
            placeholder={t("phSearchTags")}
            aria-label={t("phSearchTags")}
            spellCheck={false}
            autoCapitalize="none"
            enterKeyHint="done"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && fresh && pick.mode === "note") {
                e.preventDefault();
                void write([...(mine ?? []), clean(query)]);
                setQuery("");
              }
            }}
          />
        </>
      }
    >
      {all === null || mine === null ? (
        <p className="s-ph-empty">{t("loading")}</p>
      ) : (
        <ul className="s-ph-actions" role={pick.mode === "note" ? "group" : "menu"} aria-label={title}>
          {fresh && pick.mode === "note" && (
            <li>
              <button
                type="button"
                className="s-ph-actions__row s-ph-tagsheet__add"
                data-tag={clean(query)}
                onClick={() => {
                  void write([...(mine ?? []), clean(query)]);
                  setQuery("");
                }}
              >
                <span className="s-ph-actions__label">{tf("phTagAdd", { tag: clean(query) })}</span>
              </button>
            </li>
          )}
          {/* The note's own tags first, including one the vault's count has
              not caught up with yet. */}
          {pick.mode === "note" &&
            (mine ?? [])
              .filter((m) => !shown.some((tg) => tg.tag.toLowerCase() === m.toLowerCase()) && (q === "" || m.toLowerCase().includes(q)))
              .map((m) => <TagRow key={`mine:${m}`} tag={m} on count={null} onToggle={toggle} note />)}
          {shown.map((tg) => (
            <TagRow key={tg.tag} tag={tg.tag} on={pick.mode === "note" && has(tg.tag)} count={tg.count} onToggle={toggle} note={pick.mode === "note"} />
          ))}
          {shown.length === 0 && !fresh && <li className="s-ph-empty">{t("noMatchesDot")}</li>}
        </ul>
      )}
    </Sheet>
  );
}

function TagRow({ tag, on, count, onToggle, note }: { tag: string; on: boolean; count: number | null; onToggle: (tag: string) => void; note: boolean }) {
  return (
    <li>
      <button
        type="button"
        className={`s-ph-actions__row s-ph-tagsheet__row${on ? " s-ph-tagsheet__row--on" : ""}`}
        role={note ? "checkbox" : "menuitem"}
        aria-checked={note ? on : undefined}
        data-tag={tag}
        onClick={() => onToggle(tag)}
      >
        {note && (
          <span className="s-ph-task__box" aria-hidden="true">
            {on && <IconCheck />}
          </span>
        )}
        <bdi className="s-ph-actions__label" dir="auto">
          #{tag}
        </bdi>
        {count !== null && <span className="s-ph-actions__note">{localeNum(count)}</span>}
      </button>
    </li>
  );
}
