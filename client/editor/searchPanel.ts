// THE IN-NOTE FIND PANEL, drawn in the house style.
//
// CodeMirror's stock panel is a row of bare inputs, buttons and checkboxes in
// the browser's own chrome — the one piece of the editor that looked like it
// came from somewhere else. This is the same machinery (the query, the
// cursor, next/previous/replace/replace-all are all @codemirror/search's own
// commands) with a panel of ours around it: two rows (find, replace), the
// options as pills, a live "3 of 12" count, and the keys a hand expects —
// Enter next, Shift+Enter previous, Enter in the replace field replaces one,
// Escape closes. The words come from the same phrases the stock panel used
// (searchPhrases.ts), so the two languages are already there.

import { EditorView, type Panel } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from "@codemirror/search";

const MAX_COUNT = 999;

/** The stock panel's phrase keys (searchPhrases.ts maps them to the
 *  dictionary). Named here so the DOM sinks below carry no bare copy. */
const P = {
  find: "Find",
  replace: "Replace",
  replaceOne: "replace",
  next: "next",
  previous: "previous",
  all: "all",
  matchCase: "match case",
  regexp: "regexp",
  byWord: "by word",
  close: "close",
} as const;

function countMatches(state: EditorState, query: SearchQuery): { total: number; current: number } {
  if (!query.valid || query.search === "") return { total: 0, current: 0 };
  let total = 0;
  let current = 0;
  const head = state.selection.main.from;
  try {
    const cursor = query.getCursor(state);
    for (let step = cursor.next(); !step.done && total < MAX_COUNT; step = cursor.next()) {
      total++;
      if (step.value.from <= head && step.value.to >= state.selection.main.to && step.value.to >= head) current = total;
    }
  } catch {
    return { total: 0, current: 0 };
  }
  return { total, current };
}

export function createSearchPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "s-cmsearch";
  dom.setAttribute("role", "search");

  const phrase = (key: string): string => view.state.phrase(key);

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const btn = (cls: string, label: string, title: string, onClick: () => void): HTMLButtonElement => {
    const b = el("button", cls, label);
    b.type = "button";
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", onClick);
    return b;
  };

  // Row one: find, count, prev/next, options, close.
  const row1 = el("div", "s-cmsearch__row");
  const find = el("input", "s-cmsearch__input s-cmsearch__input--find");
  find.type = "text";
  find.placeholder = phrase(P.find);
  find.setAttribute("aria-label", phrase(P.find));
  find.setAttribute("main-field", "true");
  find.spellcheck = false;
  const count = el("span", "s-cmsearch__count");
  const prev = btn("s-cmsearch__btn", "↑", phrase(P.previous), () => findPrevious(view));
  const next = btn("s-cmsearch__btn", "↓", phrase(P.next), () => findNext(view));
  const opts = el("span", "s-cmsearch__opts");
  const optCase = btn("s-cmsearch__opt", "Aa", phrase(P.matchCase), () => toggle("caseSensitive"));
  const optRe = btn("s-cmsearch__opt", ".*", phrase(P.regexp), () => toggle("regexp"));
  const optWord = btn("s-cmsearch__opt", "ab", phrase(P.byWord), () => toggle("wholeWord"));
  opts.append(optCase, optRe, optWord);
  const close = btn("s-cmsearch__btn s-cmsearch__close", "✕", phrase(P.close), () => closeSearchPanel(view));
  row1.append(find, count, prev, next, opts, close);

  // Row two: replace, replace one, replace all.
  const row2 = el("div", "s-cmsearch__row");
  const replace = el("input", "s-cmsearch__input s-cmsearch__input--replace");
  replace.type = "text";
  replace.placeholder = phrase(P.replace);
  replace.setAttribute("aria-label", phrase(P.replace));
  replace.spellcheck = false;
  const replOne = btn("s-cmsearch__btn s-cmsearch__word", phrase(P.replaceOne), phrase(P.replaceOne), () => replaceNext(view));
  const replAll = btn("s-cmsearch__btn s-cmsearch__word", phrase(P.all), `${phrase(P.replaceOne)} ${phrase(P.all)}`, () => replaceAll(view));
  row2.append(replace, replOne, replAll);
  dom.append(row1, row2);

  let query = getSearchQuery(view.state);
  const paint = (): void => {
    if (find.value !== query.search) find.value = query.search;
    if (replace.value !== query.replace) replace.value = query.replace;
    optCase.setAttribute("aria-pressed", String(query.caseSensitive));
    optRe.setAttribute("aria-pressed", String(query.regexp));
    optWord.setAttribute("aria-pressed", String(query.wholeWord));
    optCase.classList.toggle("s-cmsearch__opt--on", query.caseSensitive);
    optRe.classList.toggle("s-cmsearch__opt--on", query.regexp);
    optWord.classList.toggle("s-cmsearch__opt--on", query.wholeWord);
    const { total, current } = countMatches(view.state, query);
    count.textContent = query.search === "" ? "" : total >= MAX_COUNT ? `${MAX_COUNT}+` : current > 0 ? `${current} / ${total}` : String(total);
    count.classList.toggle("s-cmsearch__count--none", query.search !== "" && total === 0);
    find.classList.toggle("s-cmsearch__input--bad", query.search !== "" && !query.valid);
  };
  const commit = (): void => {
    query = new SearchQuery({
      search: find.value,
      replace: replace.value,
      caseSensitive: query.caseSensitive,
      regexp: query.regexp,
      wholeWord: query.wholeWord,
    });
    view.dispatch({ effects: setSearchQuery.of(query) });
    paint();
  };
  const toggle = (key: "caseSensitive" | "regexp" | "wholeWord"): void => {
    query = new SearchQuery({ ...query, search: find.value, replace: replace.value, [key]: !query[key] });
    view.dispatch({ effects: setSearchQuery.of(query) });
    paint();
    find.focus();
  };
  find.addEventListener("input", commit);
  replace.addEventListener("input", commit);
  dom.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeSearchPanel(view);
      view.focus();
    } else if (e.key === "Enter" && e.target === find) {
      e.preventDefault();
      if (e.shiftKey) findPrevious(view);
      else findNext(view);
    } else if (e.key === "Enter" && e.target === replace) {
      e.preventDefault();
      if (e.shiftKey || e.ctrlKey || e.metaKey) replaceAll(view);
      else replaceNext(view);
    }
  });
  paint();

  return {
    dom,
    top: true,
    mount() {
      find.focus();
      find.select();
    },
    update(update) {
      const q = getSearchQuery(update.state);
      if (!q.eq(query)) {
        query = q;
        paint();
      } else if (update.docChanged || update.selectionSet) paint();
    },
  };
}

