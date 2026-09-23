// SEARCH — the drawer's search box and the command palette, as one screen.
//
// A full-screen field, focused on arrival (the tab IS the intent to type), and
// three segments over what it finds: Notes (the vault search, recents while
// the field is empty), Commands (the palette's own COMMANDS table, ranked by
// the palette's own ranker — client/paletteRank.ts — and run through the
// palette's own dispatcher, so "the palette's commands" are one list on both
// shells), and Tags. The desktop's Ctrl/Cmd+K and Ctrl/Cmd+P both land here
// when a keyboard is attached.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { SearchHit, TagCount } from "../../../shared/types.ts";
import { search, getTags } from "../../api.ts";
import { COMMANDS, runPaletteCommand, runPalettePrompt, type Command, type CommandCtx } from "../../components/CommandPalette.tsx";
import { promptModal } from "../../components/Confirm.tsx";
import { collectNotes } from "../../editor/links.ts";
import { localeNum, t } from "../../i18n.ts";
import { rankCommands } from "../../paletteRank.ts";
import { recentNotes } from "../../recents.ts";
import { useStore } from "../../state.ts";
import { isBookPath } from "../../workspace.ts";
import { usePhone } from "../context.ts";
import { IconFile, IconBook } from "../icons.tsx";
import type { Screen } from "../nav.ts";
import TopBar from "../TopBar.tsx";

type Segment = "notes" | "commands" | "tags";

/** Commands that are about the DESKTOP's furniture — panes, tabs, the
 *  sidebar's edge, a layout of windows — and mean nothing in a shell that has
 *  none of it. Keyboard-only modes join them unless a keyboard is attached. */
const DESKTOP_ONLY = new Set([
  "split-pane",
  "split-pane-down",
  "close-pane",
  "focus-next-pane",
  "toggle-sidebar",
  "toggle-panel",
  "sidebar-side-auto",
  "sidebar-side-left",
  "sidebar-side-right",
  "restore-layout",
  "save-layout",
  "pop-out",
  "reveal-in-tree",
  "collapse-folders",
  "expand-folders",
]);
const KEYBOARD_ONLY = new Set(["toggle-vim", "zen-mode", "shortcuts"]);

/** The server's snippet carries its match in <mark>…</mark>; everything else
 *  in it is text. Rendered as text with the marks as elements — never as HTML. */
function Snippet({ html }: { html: string }) {
  const parts = html.split(/(<mark>|<\/mark>)/);
  let on = false;
  const out: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part === "<mark>") on = true;
    else if (part === "</mark>") on = false;
    else if (part) {
      const text = part.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
      out.push(on ? <mark key={i}>{text}</mark> : <Fragment key={i}>{text}</Fragment>);
    }
  });
  return <span className="s-ph-hit__snippet" dir="auto">{out}</span>;
}

export default function SearchScreen() {
  const phone = usePhone();
  const tree = useStore((s) => s.tree);
  const admin = useStore((s) => s.admin);
  useStore((s) => s.language);
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<Segment>("notes");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [tags, setTags] = useState<TagCount[]>([]);
  const fieldRef = useRef<HTMLInputElement | null>(null);

  // Focused on arrival: coming to this tab is the intent to type.
  useEffect(() => {
    const id = requestAnimationFrame(() => fieldRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, []);

  // The vault search, debounced, only the latest query landing.
  useEffect(() => {
    const query = q.trim();
    if (query === "" || segment !== "notes") {
      setHits(null);
      return;
    }
    const ctl = new AbortController();
    const timer = window.setTimeout(() => {
      search(query, ctl.signal)
        .then((r) => setHits(r))
        .catch(() => {
          if (!ctl.signal.aborted) setHits([]);
        });
    }, 140);
    return () => {
      ctl.abort();
      window.clearTimeout(timer);
    };
  }, [q, segment]);

  useEffect(() => {
    if (segment !== "tags") return;
    let live = true;
    getTags()
      .then((list) => live && setTags(list))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [segment]);

  const recents = useMemo(() => {
    if (!tree) return [];
    const titles = new Map(collectNotes(tree).map((n) => [n.path, n.title]));
    return recentNotes(tree, { limit: 12 }).map((path) => ({ path, title: titles.get(path) ?? path }));
  }, [tree]);

  const commands = useMemo(() => {
    const s = useStore.getState();
    const ctx: CommandCtx = {
      openPath: s.openPath,
      admin: s.admin,
      authProtected: s.authProtected,
      openPublished: s.openPublished ?? (s.openPath !== null && (s.publishedPaths?.has(s.openPath) ?? false)),
      preview: s.previewVisitor,
      reading: s.readingMode,
      panes: 1,
      hasTwin: s.openPath !== null && s.twins[s.openPath] !== undefined,
    };
    const available = COMMANDS.filter((c) => c.available(ctx) && !DESKTOP_ONLY.has(c.id) && (phone.keyboard || !KEYBOARD_ONLY.has(c.id)));
    const query = q.trim();
    if (query === "") return available;
    return rankCommands(query, available, (c) => ({ label: c.label(), hint: c.hint?.() })).map((r) => r.command);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, phone.keyboard, segment, admin]);

  const shownTags = useMemo(() => {
    const query = q.trim().replace(/^#/, "").toLowerCase();
    return tags.filter((tag) => query === "" || tag.tag.toLowerCase().includes(query)).sort((a, b) => b.count - a.count);
  }, [tags, q]);

  const openPath = (path: string): void => {
    const screen: Screen = isBookPath(path) ? { kind: "surface", tab: path } : { kind: "note", path };
    phone.open(screen);
  };

  const run = (c: Command): void => {
    if (c.prompt) {
      const prompt = c.prompt;
      void promptModal({ title: c.label(), placeholder: prompt.placeholder, value: prompt.initial(), confirmLabel: t("phRun") }).then((value) => {
        if (value) runPalettePrompt(c, value);
      });
      return;
    }
    runPaletteCommand(c);
  };

  const SEGMENTS: { id: Segment; label: string }[] = [
    { id: "notes", label: t("phTabNotes") },
    { id: "commands", label: t("paletteCommands") },
    { id: "tags", label: t("tags") },
  ];

  return (
    <div className="s-ph-screen s-ph-search" data-screen="search">
      <TopBar title={t("phTabSearch")} />
      <div className="s-ph-search__bar">
        <input
          ref={fieldRef}
          className="s-ph-field s-ph-search__field"
          type="search"
          dir="auto"
          value={q}
          placeholder={segment === "commands" ? t("phSearchCommands") : segment === "tags" ? t("phSearchTags") : t("searchPlaceholder")}
          aria-label={t("phTabSearch")}
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (segment === "notes" && hits && hits[0]) openPath(hits[0].path);
            else if (segment === "commands" && commands[0]) run(commands[0]);
          }}
        />
        <div className="s-ph-seg" role="tablist" aria-label={t("phTabSearch")}>
          {SEGMENTS.map((s) => (
            <button key={s.id} type="button" role="tab" data-segment={s.id} aria-selected={segment === s.id} className={`s-ph-seg__btn${segment === s.id ? " s-ph-seg__btn--on" : ""}`} onClick={() => setSegment(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="s-ph-scroll" role="tabpanel">
        {segment === "notes" && (
          <>
            {q.trim() === "" ? (
              recents.length > 0 && (
                <>
                  <h2 className="s-ph-head">{t("recentlyRead")}</h2>
                  <ul className="s-ph-list">
                    {recents.map((r) => (
                      <li key={r.path}>
                        <button type="button" className="s-ph-row" onClick={() => openPath(r.path)}>
                          <span className="s-ph-row__glyph" aria-hidden="true">
                            <IconFile />
                          </span>
                          <bdi className="s-ph-row__name" dir="auto">
                            {r.title}
                          </bdi>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )
            ) : hits === null ? null : hits.length === 0 ? (
              <p className="s-ph-empty">{t("noMatchesDot")}</p>
            ) : (
              <ul className="s-ph-list" aria-label={t("phTabNotes")}>
                {hits.map((hit) => (
                  <li key={`${hit.path}#${hit.page ?? ""}`}>
                    <button type="button" className="s-ph-row s-ph-hit" onClick={() => openPath(hit.path)}>
                      <span className="s-ph-row__glyph" aria-hidden="true">
                        {hit.kind === "book" ? <IconBook /> : <IconFile />}
                      </span>
                      <span className="s-ph-hit__text">
                        <bdi className="s-ph-row__name" dir="auto">
                          {hit.title}
                        </bdi>
                        {hit.snippet && <Snippet html={hit.snippet} />}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {segment === "commands" && (
          <ul className="s-ph-list" aria-label={t("paletteCommands")}>
            {commands.map((c) => (
              <li key={c.id}>
                <button type="button" className="s-ph-row s-ph-cmd" data-command={c.id} onClick={() => run(c)}>
                  <span className="s-ph-hit__text">
                    <span className="s-ph-row__name">{c.label()}</span>
                    {c.hint && <span className="s-ph-hit__snippet">{c.hint()}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {segment === "tags" && (
          <ul className="s-ph-list" aria-label={t("tags")}>
            {shownTags.map((tag) => (
              <li key={tag.tag}>
                <button type="button" className="s-ph-row" onClick={() => phone.open({ kind: "tag", tag: tag.tag })}>
                  <bdi className="s-ph-row__name" dir="auto">
                    #{tag.tag}
                  </bdi>
                  <span className="s-ph-row__count">{localeNum(tag.count)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
