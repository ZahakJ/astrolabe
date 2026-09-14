// UNLINKED MENTIONS — the backlinks panel's second list.
//
// Every Obsidian reader checks this pane: prose that names the open note
// without linking it, each row with a Link button that wraps the words as
// `[[Note]]`. It is how atomic notes get woven. The scan is the server's
// (`GET /api/mentions`, folded like search, whole words, never inside a link
// or code); the write is one route that splices one line under the mtime
// precondition (`POST /api/mentions/link`), so the panel never holds the
// other note's text. Re-read on every vault event, because a link written
// here is itself a change the backlinks list must hear.

import { useCallback, useEffect, useState } from "react";
import type { Mention } from "../../shared/types.ts";
import { getMentions, linkMention } from "../api.ts";
import { localeNum, t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";

const COLLAPSED_KEY = "astrolabe.mentions-collapsed";
const VAULT_EVENT = "astrolabe:vault";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export default function MentionsPanel() {
  const openPath = useStore((s) => s.openPath);
  const admin = useStore((s) => s.admin);
  const preview = useStore((s) => s.previewVisitor);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [rows, setRows] = useState<Mention[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback((): void => {
    if (!openPath || !admin || preview) {
      setRows([]);
      return;
    }
    getMentions(openPath)
      .then(setRows)
      .catch(() => setRows([]));
  }, [openPath, admin, preview]);

  useEffect(() => {
    load();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 300);
    };
    window.addEventListener(VAULT_EVENT, onVault);
    return () => {
      window.removeEventListener(VAULT_EVENT, onVault);
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  if (!admin || preview || !openPath || rows.length === 0) return null;

  const toggle = (): void => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      // storage unavailable
    }
  };

  const link = async (m: Mention): Promise<void> => {
    const key = `${m.path}:${m.line}:${m.start}`;
    setBusy(key);
    try {
      await linkMention(m, openPath);
      setRows((list) => list.filter((r) => r !== m));
      toast(tf("mentionLinked", { title: m.title }));
    } catch {
      toast(t("mentionLinkFailed"), "error");
      load();
    } finally {
      setBusy(null);
    }
  };

  const linkAll = async (): Promise<void> => {
    setBusy("*");
    let done = 0;
    // One at a time, in order: each write moves the offsets of nothing but
    // its own line, and a stale row simply answers 409 and stays listed.
    for (const m of rows) {
      try {
        await linkMention(m, openPath);
        done++;
      } catch {
        // stays in the list on reload
      }
    }
    setBusy(null);
    toast(tf("mentionsLinkedAll", { n: localeNum(done) }));
    load();
  };

  return (
    <section className="s-mentions">
      <header className="s-panel-header s-mentions__header">
        <button type="button" className="s-mentions__toggle" onClick={toggle} aria-expanded={!collapsed} title={t(collapsed ? "showMentions" : "hideMentions")}>
          <span className={`s-tree__chevron${collapsed ? "" : " s-tree__chevron--open"}`} aria-hidden="true">›</span>
          <span className="s-panel-title">{t("unlinkedMentions")}</span>
          <span className="s-panel-count">{localeNum(rows.length)}</span>
        </button>
        {!collapsed && rows.length > 1 && (
          <button type="button" className="s-mentions__linkall" disabled={busy !== null} onClick={() => void linkAll()}>
            {t("mentionLinkAll")}
          </button>
        )}
      </header>
      {!collapsed && (
        <div className="s-panel-body s-mentions__body">
          {rows.map((m) => {
            const key = `${m.path}:${m.line}:${m.start}`;
            return (
              <div key={key} className="s-backlink s-mentions__row" data-preview-path={m.path}>
                <button
                  type="button"
                  className="s-backlink-open"
                  onClick={() => void import("../landing.ts").then((x) => x.landOnLine(m.path, m.line))}
                  title={m.path}
                >
                  <span className="s-backlink-title">
                    <bdi>{m.title}</bdi>
                  </span>
                </button>
                <div className="s-mentions__line">
                  <button
                    type="button"
                    className="s-backlink-context s-mentions__context"
                    dir="auto"
                    onClick={() => void import("../landing.ts").then((x) => x.landOnLine(m.path, m.line))}
                  >
                    {m.context}
                  </button>
                  <button type="button" className="s-mentions__link" disabled={busy !== null} onClick={() => void link(m)} title={t("mentionLinkTitle")}>
                    {busy === key ? "…" : t("mentionLink")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
