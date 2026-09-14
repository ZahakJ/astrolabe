// TASKS ACROSS THE VAULT — every `- [ ]` line, with the Tasks plugin's
// fields read off its end.
//
// Obsidian's Tasks plugin taught a vault to write `- [ ] read ch. 3 📅
// 2026-09-20 ⏫`, and a migrating reader's to-dos already look like that. So
// the grammar is the plugin's, kept exactly: 📅 due, ⏳ scheduled, 🛫 start,
// ➕ created, ✅ done (a date), ❌ cancelled, 🔁 recurrence (kept as text),
// ⏫🔼🔽⏬ priority. The note is the state: ticking a task rewrites its one
// line — `[ ]` → `[x]` and ` ✅ today` appended — and nothing else.
//
// Pure, load-bearing on both sides like shared/tracker.ts: the indexer scans
// every note with it, the ```tasks fence draws from what the server answers,
// and the toggle route applies `toggleTaskLine` byte for byte.

import { closesFence, fenceOpener, sourceLines } from "./fences.ts";

export type TaskPriority = "highest" | "high" | "medium" | "low" | "lowest" | null;

export interface Task {
  /** 1-based line in the note's FULL source. */
  line: number;
  /** The text between the box and the fields, markdown kept. */
  text: string;
  done: boolean;
  cancelled: boolean;
  due: string | null;
  scheduled: string | null;
  start: string | null;
  created: string | null;
  /** The ✅ date, when the plugin (or this app) stamped one. */
  completed: string | null;
  recurrence: string | null;
  priority: TaskPriority;
  /** `#tags` written in the line itself. */
  tags: string[];
  /** Nesting depth (leading whitespace), for a fence that shows children. */
  indent: number;
}

export const TASK_LINE_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX\-])\]\s?(.*)$/;

const DATE = "(\\d{4}-\\d{2}-\\d{2})";
const FIELD_RE = new RegExp(`\\s*(📅|⏳|🛫|➕|✅|❌)\\s*${DATE}`, "gu");
const PRIORITY_RE = /\s*(🔺|⏫|🔼|🔽|⏬)/u;
const RECUR_RE = /\s*🔁\s*([^📅⏳🛫➕✅❌🔺⏫🔼🔽⏬#]+)/u;
const TAG_RE = /(?:^|\s)#([\p{L}\p{N}_\/-]+)/gu;

const PRIORITY: Record<string, TaskPriority> = { "🔺": "highest", "⏫": "high", "🔼": "medium", "🔽": "low", "⏬": "lowest" };

/** Parse one line as a task, or null when it is not one. */
export function parseTaskLine(raw: string, line: number): Task | null {
  const m = TASK_LINE_RE.exec(raw);
  if (!m) return null;
  let rest = m[3];
  const task: Task = {
    line,
    text: "",
    done: /x/i.test(m[2]),
    cancelled: m[2] === "-",
    due: null,
    scheduled: null,
    start: null,
    created: null,
    completed: null,
    recurrence: null,
    priority: null,
    tags: [],
    indent: m[1].length,
  };
  for (const f of rest.matchAll(FIELD_RE)) {
    const date = f[2];
    switch (f[1]) {
      case "📅": task.due = date; break;
      case "⏳": task.scheduled = date; break;
      case "🛫": task.start = date; break;
      case "➕": task.created = date; break;
      case "✅": task.completed = date; break;
      case "❌": task.cancelled = true; task.completed = date; break;
    }
  }
  rest = rest.replace(FIELD_RE, "");
  const pr = PRIORITY_RE.exec(rest);
  if (pr) {
    task.priority = PRIORITY[pr[1]] ?? null;
    rest = rest.replace(PRIORITY_RE, "");
  }
  const rc = RECUR_RE.exec(rest);
  if (rc) {
    task.recurrence = rc[1].trim();
    rest = rest.replace(RECUR_RE, "");
  }
  for (const t of rest.matchAll(TAG_RE)) task.tags.push(t[1].toLowerCase());
  task.text = rest.trim();
  return task;
}

/** Every task in a note, fences skipped, lines counted in the full source. */
export function scanTasks(md: string): Task[] {
  const out: Task[] = [];
  const lines = sourceLines(md);
  let fence: ReturnType<typeof fenceOpener> = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const opened = fenceOpener(line);
    if (opened) {
      fence = opened;
      continue;
    }
    const task = parseTaskLine(line, i + 1);
    if (task) out.push(task);
  }
  return out;
}

/** `raw` with its box flipped: done → `[x]` and ` ✅ date` appended (the
 *  plugin's stamp, so Obsidian's Tasks reads the same state); undone →
 *  `[ ]` with any ✅ stamp removed. Anything else on the line survives. */
export function toggleTaskLine(raw: string, done: boolean, today: string): string {
  const m = TASK_LINE_RE.exec(raw);
  if (!m) return raw;
  const head = raw.slice(0, m[1].length) + raw.slice(m[1].length, raw.indexOf("[", m[1].length));
  let rest = m[3];
  rest = rest.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/gu, "");
  const body = rest.replace(/\s+$/, "");
  if (done) return `${head}[x] ${body} ✅ ${today}`;
  return `${head}[ ] ${body}`;
}

// ── The fence ───────────────────────────────────────────────────────────────

export interface TasksSpec {
  /** "todo" (not done, the default), "done", "all". */
  status: "todo" | "done" | "all";
  /** Due window, inclusive ISO dates; null = unbounded. */
  dueFrom: string | null;
  dueTo: string | null;
  /** Only tasks that HAVE a due date, when true. */
  hasDue: boolean;
  /** Include tasks with no due date at all (default true unless a window is set). */
  path: string | null;
  tag: string | null;
  limit: number;
  /** Group by the note they live in (default) or flat. */
  group: "note" | "none";
  sort: "due" | "priority" | "path";
}

export function parseTasksFence(body: string, today: string): TasksSpec {
  const spec: TasksSpec = { status: "todo", dueFrom: null, dueTo: null, hasDue: false, path: null, tag: null, limit: 200, group: "note", sort: "due" };
  const week = (iso: string): [string, string] => {
    const d = new Date(`${iso}T00:00:00Z`);
    const day = (d.getUTCDay() + 6) % 7; // Monday-first
    d.setUTCDate(d.getUTCDate() - day);
    const from = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 6);
    return [from, d.toISOString().slice(0, 10)];
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim().toLowerCase();
    if (line === "") continue;
    if (line === "not done" || line === "todo" || line === "open") spec.status = "todo";
    else if (line === "done") spec.status = "done";
    else if (line === "all") spec.status = "all";
    else if (line === "has due date" || line === "has due") spec.hasDue = true;
    else if (line === "due today") { spec.dueFrom = today; spec.dueTo = today; spec.hasDue = true; }
    else if (line === "due this week") { [spec.dueFrom, spec.dueTo] = week(today); spec.hasDue = true; }
    else if (line === "overdue") { spec.dueTo = shift(today, -1); spec.hasDue = true; }
    else if (/^due (before|after|on) \d{4}-\d{2}-\d{2}$/.test(line)) {
      const [, op, date] = /^due (before|after|on) (\d{4}-\d{2}-\d{2})$/.exec(line) ?? [];
      spec.hasDue = true;
      if (op === "before") spec.dueTo = shift(date, -1);
      else if (op === "after") spec.dueFrom = shift(date, 1);
      else { spec.dueFrom = date; spec.dueTo = date; }
    } else if (line.startsWith("path:")) spec.path = raw.trim().slice(5).trim().replace(/^"|"$/g, "") || null;
    else if (line.startsWith("tag:")) spec.tag = line.slice(4).trim().replace(/^#/, "") || null;
    else if (line.startsWith("limit:")) spec.limit = Math.max(1, Math.min(1000, Number(line.slice(6)) || 200));
    else if (line.startsWith("group:")) spec.group = line.slice(6).trim() === "none" ? "none" : "note";
    else if (line.startsWith("sort:")) {
      const s = line.slice(5).trim();
      spec.sort = s === "priority" ? "priority" : s === "path" ? "path" : "due";
    }
  }
  return spec;
}

export function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const PRIORITY_RANK: Record<string, number> = { highest: 0, high: 1, medium: 2, low: 4, lowest: 5 };

/** Apply a spec to a flat list of `{ path, tags, task }`. */
export function filterTasks<T extends { path: string; tags: string[]; task: Task }>(rows: T[], spec: TasksSpec): T[] {
  const out = rows.filter(({ path, tags, task }) => {
    if (spec.status === "todo" && (task.done || task.cancelled)) return false;
    if (spec.status === "done" && !task.done) return false;
    if (spec.hasDue && task.due === null) return false;
    if (spec.dueFrom !== null && (task.due === null || task.due < spec.dueFrom)) return false;
    if (spec.dueTo !== null && (task.due === null || task.due > spec.dueTo)) return false;
    if (spec.path !== null && !path.toLowerCase().includes(spec.path.toLowerCase())) return false;
    if (spec.tag !== null && !tags.includes(spec.tag) && !task.tags.includes(spec.tag)) return false;
    return true;
  });
  out.sort((a, b) => {
    if (spec.sort === "priority") {
      const pa = a.task.priority ? PRIORITY_RANK[a.task.priority] : 3;
      const pb = b.task.priority ? PRIORITY_RANK[b.task.priority] : 3;
      if (pa !== pb) return pa - pb;
    }
    if (spec.sort !== "path") {
      const da = a.task.due ?? "9999";
      const db = b.task.due ?? "9999";
      if (da !== db) return da < db ? -1 : 1;
    }
    return a.path.localeCompare(b.path) || a.task.line - b.task.line;
  });
  return out.slice(0, spec.limit);
}

export function tasksFenceKind(line: string): "tasks" | null {
  const m = /^\s*(?:`{3,}|~{3,})\s*([^\s`~]*)\s*$/.exec(line);
  return m && m[1].toLowerCase() === "tasks" ? "tasks" : null;
}
