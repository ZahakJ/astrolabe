// THE TASKS FENCE, DRAWN — open tasks across the vault as one checklist,
// grouped by note, each box live for an admin (a tick posts one line flip)
// and a picture for everyone else. Loaded on demand; the query fence's
// shape.

import "./tasks.css";
import type { TaskMeta } from "../../shared/types.ts";
import { filterTasks, type TasksSpec } from "../../shared/tasks.ts";
import { isoDate } from "../../shared/routine.ts";
import { getTasks, toggleTask } from "../api.ts";
import { siteDate } from "../dates.ts";
import { autoDir, localeNum, t, tf, type I18nKey } from "../i18n.ts";
import { useStore } from "../state.ts";
import { el } from "./dom.ts";
import { toast } from "../toast.ts";

export interface TasksHooks {
  notePath: string;
  /** Present on the editor and the Routines page: ticks write. */
  live?: boolean;
  onResize?: () => void;
  /** The page passes its own rows to spare a second fetch. */
  rows?: TaskMeta[];
}

const PRIORITY_LABEL: Record<string, I18nKey> = {
  highest: "tasksPriorityHighest",
  high: "tasksPriorityHigh",
  medium: "tasksPriorityMedium",
  low: "tasksPriorityLow",
  lowest: "tasksPriorityLowest",
};

function dueLabel(due: string, today: string, locale: string): { text: string; cls: string } {
  if (due < today) return { text: siteDate(`${due}T12:00:00`, locale, { dateStyle: "medium" }), cls: "is-overdue" };
  if (due === today) return { text: t("tasksDueToday"), cls: "is-today" };
  return { text: siteDate(`${due}T12:00:00`, locale, { dateStyle: "medium" }), cls: "" };
}

export function renderTasksFence(spec: TasksSpec, hooks: TasksHooks): HTMLElement {
  const box = el("div", "s-rv-tasks");
  const locale = useStore.getState().blogLocale;
  const today = isoDate(new Date());
  const head = el("div", "s-rv-tasks__head");
  const count = el("span", "s-rv-tasks__count", "…");
  head.appendChild(el("span", "s-rv-tasks__title", t("tasksTitle")));
  head.appendChild(count);
  box.appendChild(head);
  const body = el("div", "s-rv-tasks__body");
  box.appendChild(body);

  const draw = (rows: TaskMeta[]): void => {
    const kept = filterTasks(rows, spec);
    count.textContent = tf("tasksCount", { n: localeNum(kept.length) });
    body.replaceChildren();
    if (kept.length === 0) {
      body.appendChild(el("p", "s-rv-tasks__empty", t("tasksEmpty")));
      hooks.onResize?.();
      return;
    }
    const groups = new Map<string, { title: string; items: TaskMeta[] }>();
    for (const r of kept) {
      const key = spec.group === "none" ? "" : r.path;
      const g = groups.get(key) ?? { title: r.title, items: [] };
      g.items.push(r);
      groups.set(key, g);
    }
    for (const [path, g] of groups) {
      const section = el("div", "s-rv-tasks__group");
      if (path !== "") {
        const a = document.createElement("a");
        a.className = "s-rv-tasks__note s-rv-wikilink";
        a.dataset.target = path;
        a.setAttribute("role", "link");
        a.tabIndex = 0;
        a.textContent = g.title;
        a.dir = autoDir(g.title);
        section.appendChild(a);
      }
      const list = el("ul", "s-rv-tasks__list");
      for (const r of g.items) {
        const li = el("li", `s-rv-tasks__item${r.task.done ? " is-done" : ""}${r.task.cancelled ? " is-cancelled" : ""}`);
        li.dir = autoDir(r.task.text);
        const label = el("label", "s-rv-tasks__label");
        const box2 = el("input", "s-rv-tasks__check");
        box2.type = "checkbox";
        box2.checked = r.task.done;
        box2.disabled = !hooks.live;
        if (hooks.live) {
          box2.addEventListener("change", () => {
            box2.disabled = true;
            toggleTask(r.path, r.task.line, box2.checked, today)
              .then(() => {
                r.task.done = box2.checked;
                draw(rows);
                // The note may be open in an editor whose last autosave was a
                // moment ago; the SSE echo would then read as a self-save and
                // leave the buffer stale. Adopt the write explicitly, as a
                // version restore does.
                void import("../editor/bufferBridge.ts").then((m) => m.adoptExternalChange(r.path));
              })
              .catch(() => {
                toast(t("tasksToggleFailed"), "error");
                box2.checked = !box2.checked;
                box2.disabled = false;
              });
          });
        }
        label.appendChild(box2);
        const text = el("span", "s-rv-tasks__text", r.task.text);
        text.dir = autoDir(r.task.text);
        label.appendChild(text);
        li.appendChild(label);
        const meta = el("span", "s-rv-tasks__meta");
        if (r.task.priority) meta.appendChild(el("span", `s-rv-tasks__prio s-rv-tasks__prio--${r.task.priority}`, t(PRIORITY_LABEL[r.task.priority])));
        if (r.task.due) {
          const d = dueLabel(r.task.due, today, locale);
          meta.appendChild(el("span", `s-rv-tasks__due ${d.cls}`, d.text));
        }
        if (r.task.recurrence) meta.appendChild(el("span", "s-rv-tasks__recur", `🔁 ${r.task.recurrence}`));
        if (meta.childElementCount > 0) li.appendChild(meta);
        list.appendChild(li);
      }
      section.appendChild(list);
      body.appendChild(section);
    }
    hooks.onResize?.();
  };

  if (hooks.rows) draw(hooks.rows);
  else
    getTasks()
      .then(draw)
      .catch(() => {
        count.textContent = "";
        body.appendChild(el("p", "s-rv-tasks__empty", t("tasksFailed")));
        hooks.onResize?.();
      });
  return box;
}
