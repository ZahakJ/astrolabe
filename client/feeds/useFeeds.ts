// FEEDS, THE LOGIC BOTH SHELLS SHARE (docs/feeds.md).
//
// The desktop's tab (./FeedsView.tsx) and the phone's two screens
// (client/phone/screens/FeedsScreen.tsx, FeedItemScreen.tsx) draw different
// chrome over the same state: the list, the item open in the reader, and the
// three verbs — Keep, Mark read, Open the original. It lives here, beside
// neither shell, so neither has to import the other (scripts/shell-seam.mjs).
//
// THE LIST IS STABLE WHILE IT IS READ. Marking an item read does not pull it
// out from under the reader: it dims in place, `j` still steps past it, and
// the next load (a refresh, the surface opened again) leaves it out. A list
// that reflowed on every `e` would move the next item to where the eye just
// was.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { groupItems, type FeedItemFull, type FeedItemSummary, type FeedsState } from "../../shared/feeds.ts";
import { ApiError, getFeedItem, getFeeds, keepFeedItem, markFeedItemRead, refreshFeeds } from "../api.ts";
import { t, tf } from "../i18n.ts";
import { toast } from "../toast.ts";
import { actionToast } from "../undoToast.ts";
import { isKey } from "../keys.ts";
import { useStore } from "../state.ts";

export function itemKey(item: { feed: string; guid: string }): string {
  return `${item.feed}\u0000${item.guid}`;
}

export interface FeedsModel {
  state: FeedsState | null;
  failed: boolean;
  /** The items as loaded, with the reader's flags applied since. */
  items: FeedItemSummary[];
  groups: ReturnType<typeof groupItems>;
  /** Reading order: the groups flattened. */
  order: FeedItemSummary[];
  selected: string | null;
  item: FeedItemFull | null;
  itemFailed: boolean;
  refreshing: boolean;
  keeping: boolean;
  load(): void;
  refresh(): Promise<void>;
  select(key: string | null): void;
  step(delta: 1 | -1): void;
  setRead(read: boolean, key?: string): Promise<void>;
  keep(key?: string): Promise<string | null>;
  openOriginal(key?: string): void;
}

/** The whole model. `initial` selects an item on mount (the phone's item
 *  screen names its item in the route); `openNote` is how the Keep toast's
 *  Open goes to the note — the workspace's tab on the desktop, a pushed
 *  screen on the phone. */
export function useFeeds(initial: string | null = null, openNote: (path: string) => void = (p) => useStore.getState().openNote(p)): FeedsModel {
  const opener = useRef(openNote);
  opener.current = openNote;
  const [state, setState] = useState<FeedsState | null>(null);
  const [failed, setFailed] = useState(false);
  const [items, setItems] = useState<FeedItemSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(initial);
  const [item, setItem] = useState<FeedItemFull | null>(null);
  const [itemFailed, setItemFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const accept = useCallback((next: FeedsState) => {
    if (!live.current) return;
    setState(next);
    setFailed(false);
    // Items the reader has open stay in the list even once read.
    setItems((prev) => {
      const fresh = new Map(next.items.map((i) => [itemKey(i), i]));
      const kept = prev.filter((i) => !fresh.has(itemKey(i)) && i.read);
      return [...next.items, ...kept];
    });
  }, []);

  const load = useCallback(() => {
    getFeeds()
      .then(accept)
      .catch(() => live.current && setFailed(true));
  }, [accept]);
  useEffect(load, [load]);

  // A round the server is running is polled until it ends, so the first
  // open after turning fetching on fills in without a reload.
  useEffect(() => {
    if (!state?.busy) return;
    const id = window.setTimeout(load, 2500);
    return () => window.clearTimeout(id);
  }, [state, load]);

  const groups = useMemo(() => groupItems(state?.feeds ?? [], items), [state, items]);
  const order = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const byKey = useMemo(() => new Map(items.map((i) => [itemKey(i), i])), [items]);

  useEffect(() => {
    setItem(null);
    setItemFailed(false);
    if (selected === null) return;
    const it = byKey.get(selected);
    const [feed, guid] = selected.split("\u0000");
    let on = true;
    getFeedItem(it?.feed ?? feed, it?.guid ?? guid)
      .then((full) => on && setItem(full))
      .catch(() => on && setItemFailed(true));
    return () => {
      on = false;
    };
    // byKey changes on every read flag; the item only on selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const patch = useCallback((key: string, change: Partial<FeedItemSummary>) => {
    setItems((prev) => prev.map((i) => (itemKey(i) === key ? { ...i, ...change } : i)));
    setItem((cur) => (cur && itemKey(cur) === key ? { ...cur, ...change } : cur));
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      accept(await refreshFeeds());
    } catch (err) {
      toast(err instanceof ApiError && err.code === "feedsOff" ? t("feedsOffToast") : t("feedsRefreshFailed"), "error");
    } finally {
      if (live.current) setRefreshing(false);
    }
  }, [accept]);

  const step = useCallback(
    (delta: 1 | -1) => {
      if (order.length === 0) return;
      const at = selected === null ? -1 : order.findIndex((i) => itemKey(i) === selected);
      const next = at === -1 ? (delta === 1 ? 0 : order.length - 1) : Math.max(0, Math.min(order.length - 1, at + delta));
      setSelected(itemKey(order[next]));
    },
    [order, selected],
  );

  const setRead = useCallback(
    async (read: boolean, key = selected ?? undefined) => {
      if (key === undefined) return;
      const it = byKey.get(key);
      if (!it) return;
      patch(key, { read });
      try {
        await markFeedItemRead(it.feed, it.guid, read);
      } catch {
        patch(key, { read: !read });
        toast(t("feedsReadFailed"), "error");
      }
    },
    [selected, byKey, patch],
  );

  const keep = useCallback(
    async (key = selected ?? undefined): Promise<string | null> => {
      if (key === undefined) return null;
      const it = byKey.get(key) ?? (item && itemKey(item) === key ? item : undefined);
      if (!it) return null;
      setKeeping(true);
      try {
        const out = await keepFeedItem(it.feed, it.guid);
        patch(key, { read: true, kept: out.path });
        const path = out.path;
        actionToast(tf(out.already ? "feedsKeptAlready" : "feedsKept", { path }), t("feedsOpenKept"), () => opener.current(path));
        return path;
      } catch (err) {
        toast(err instanceof Error && err.message ? err.message : t("feedsKeepFailed"), "error");
        return null;
      } finally {
        if (live.current) setKeeping(false);
      }
    },
    [selected, byKey, item, patch],
  );

  const openOriginal = useCallback(
    (key = selected ?? undefined) => {
      if (key === undefined) return;
      const url = byKey.get(key)?.url ?? (item && itemKey(item) === key ? item.url : null);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    },
    [selected, byKey, item],
  );

  return { state, failed, items, groups, order, selected, item, itemFailed, refreshing, keeping, load, refresh, select: setSelected, step, setRead, keep, openOriginal };
}

/** When the list was last asked, in the reader's words: "every hour · last
 *  asked 12 minutes ago", or why nothing is asked at all. */
export function feedsStatusLine(state: FeedsState, now = Date.now()): string {
  if (!state.fetch) return t("feedsStatusOff");
  const every = state.cadenceMinutes % 60 === 0 && state.cadenceMinutes >= 60 ? tf("feedsEveryHours", { n: state.cadenceMinutes / 60 }) : tf("feedsEveryMinutes", { n: state.cadenceMinutes });
  if (state.busy) return `${every} · ${t("feedsChecking")}`;
  if (state.lastRound === null) return every;
  const mins = Math.max(0, Math.round((now - state.lastRound) / 60_000));
  return `${every} · ${mins < 1 ? t("feedsCheckedNow") : tf("feedsCheckedAgo", { n: mins })}`;
}

/** The keys the Feeds surface answers, by physical position (client/keys.ts):
 *  j / k step, o opens the original, e marks read and steps on. Returns true
 *  when the key was one of them. Never while typing in a field. */
export function feedsKey(e: ReactKeyboardEvent, model: Pick<FeedsModel, "step" | "openOriginal" | "setRead">): boolean {
  const native = e.nativeEvent;
  if (native.ctrlKey || native.metaKey || native.altKey) return false;
  const target = native.target as HTMLElement | null;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return false;
  // keymap-surface: feeds j k o e (docs/keymap.md "Feeds")
  if (isKey(native, "j")) model.step(1);
  else if (isKey(native, "k")) model.step(-1);
  else if (isKey(native, "o")) model.openOriginal();
  else if (isKey(native, "e")) {
    void model.setRead(true);
    model.step(1);
  } else return false;
  e.preventDefault();
  return true;
}
