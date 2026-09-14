// THE RELEASE NOTES — one deck per minor version, each slide a VISUAL and a
// few words in both languages.
//
// A slide's visual is one of three things, and "demo" is the one to reach
// for: a live piece of the product, drawn by the product's own renderer with
// sample data, so the preview is the feature and never a stale picture of
// it. An `svg` is for a mechanism a drawing explains better; an `image` is
// the last resort (a PNG under client/whatsnew/media/, imported as a URL).
//
// ADDING A RELEASE: add the version to versions.ts, an entry here with at
// least one slide, English AND Arabic on every string. scripts/check-whatsnew
// fails the build when a new x.Y.0 has no deck. This file is a lazy chunk —
// prose and demos cost the entry nothing.

import { isoDate, mergeEntry, parseRoutine, parseRoutineLog, shiftDate, type EntryPatch, type RoutineEntry } from "../../shared/routine.ts";
import { t } from "../i18n.ts";

export type Lang = "en" | "ar";
export type Text = Record<Lang, string>;

/** A drawing's label in the reader's language. */
const L = (lang: Lang, en: string, ar: string): string => (lang === "ar" ? ar : en);

export type Visual =
  | { kind: "demo"; mount: (host: HTMLElement, lang: Lang) => void | (() => void) }
  | { kind: "svg"; svg: string | ((lang: Lang) => string) }
  | { kind: "image"; src: string; alt: Text };

export interface Slide {
  title: Text;
  body: Text;
  visual: Visual;
  /** A manual page slug to link, e.g. "routines". */
  docs?: string;
}

export interface Release {
  version: string;
  title: Text;
  slides: Slide[];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ── 3.11.0: Routines ────────────────────────────────────────────────────────

const ROUTINE_PLAN: Text = {
  en: `title: Weekly exercise
kind: exercise
slots: morning, evening
fields: minutes:number, weight:number:kg
target: 6/week
monday:
  morning: 60 min brisk walk
  evening: Full Body A
tuesday:
  morning: 60 min easy walk
  evening: Bike 40 min + abs
wednesday:
  morning: 60 min walk
  evening: Full Body B
thursday:
  morning: Easy walk
  evening: Recovery cardio
friday:
  morning: 60 min walk
  evening: Full Body A/B
saturday:
  morning: Long bike ride
  evening: Stretching
sunday:
  morning: 60 min walk
  evening: Rest + meal prep
`,
  ar: `title: تمارين الأسبوع
kind: رياضة
slots: صباحًا, مساءً
fields: دقائق:number, الوزن:number:كغ
target: 6/week
الاثنين:
  صباحًا: مشي سريع 60 دقيقة
  مساءً: جسم كامل أ
الثلاثاء:
  صباحًا: مشي خفيف 60 دقيقة
  مساءً: دراجة 40 دقيقة + بطن
الأربعاء:
  صباحًا: مشي 60 دقيقة
  مساءً: جسم كامل ب
الخميس:
  صباحًا: مشي خفيف
  مساءً: كارديو استشفاء
الجمعة:
  صباحًا: مشي 60 دقيقة
  مساءً: جسم كامل أ/ب
السبت:
  صباحًا: جولة دراجة طويلة
  مساءً: إطالة
الأحد:
  صباحًا: مشي 60 دقيقة
  مساءً: راحة + تحضير الوجبات
`,
};

/** A month of sample days behind today: mostly complete, a few partial, one
 *  missed, so the streak lights, the strip shows every state and the heat
 *  has texture. Today is left open for the reader to tick. */
function sampleLog(slots: [string, string], fields: [string, string]): string {
  const today = isoDate(new Date());
  const lines: string[] = [];
  const pattern = ["cc", "cc", "c-", "cc", "cc", "--", "cc", "cc", "cc", "c-", "cc", "cc", "cc", "cc", "cc", "cc", "c-", "cc", "cc", "cc", "cc", "cc", "cc", "cc", "cc", "cc", "cc", "cc"];
  for (let i = pattern.length; i >= 1; i--) {
    const p = pattern[pattern.length - i];
    const date = shiftDate(today, -i);
    const done: string[] = [];
    if (p[0] === "c") done.push(slots[0]);
    if (p[1] === "c") done.push(slots[1]);
    if (done.length === 0) continue;
    const minutes = 45 + ((i * 7) % 40);
    const weight = (84.6 - i * 0.05).toFixed(1);
    lines.push(`${date} | done: ${done.join(", ")} | ${fields[0]}: ${minutes} | ${fields[1]}: ${weight}`);
  }
  return lines.join("\n") + "\n";
}

function routineDemo(host: HTMLElement, lang: Lang): () => void {
  const plan = parseRoutine(ROUTINE_PLAN[lang]);
  if (!plan) return () => {};
  const slots: [string, string] = lang === "ar" ? ["صباحًا", "مساءً"] : ["morning", "evening"];
  const fields: [string, string] = lang === "ar" ? ["دقائق", "الوزن"] : ["minutes", "weight"];
  let entries: RoutineEntry[] = parseRoutineLog(sampleLog(slots, fields), plan.fields);
  let alive = true;
  const draw = (mod: typeof import("../reading/routine.ts")): void => {
    if (!alive) return;
    const card = mod.renderRoutineCard(plan, entries, {
      notePath: "Routines/Weekly exercise.md",
      // LIVE: a tick here re-draws the card from the merged entry, so the
      // streak, the strip and the heat answer the reader's own click.
      onLog: (patch: EntryPatch) => {
        const existing = entries.find((e) => e.date === patch.date) ?? null;
        const merged = mergeEntry(existing, patch);
        entries = [...entries.filter((e) => e.date !== patch.date), merged].sort((a, b) => a.date.localeCompare(b.date));
        draw(mod);
      },
    });
    host.replaceChildren(card);
  };
  void import("../reading/routine.ts").then(draw);
  return () => {
    alive = false;
  };
}

function templatesDemo(host: HTMLElement, lang: Lang): void {
  const wrap = el("div", "s-wn-templates");
  const names: Record<Lang, string[]> = {
    en: ["Exercise", "Habits", "Prayers", "Sleep", "Water", "Mood", "Reading", "Study", "Your own"],
    ar: ["رياضة", "عادات", "صلاة", "نوم", "ماء", "مزاج", "قراءة", "دراسة", "قالبك"],
  };
  const row = el("div", "s-wn-chips");
  names[lang].forEach((n, i) => {
    const chip = el("span", `s-wn-chip${i === 0 ? " is-on" : ""}${i === names[lang].length - 1 ? " is-own" : ""}`, n);
    row.appendChild(chip);
  });
  wrap.appendChild(row);
  const page = el("div", "s-wn-page");
  const head = el("div", "s-wn-page__head");
  head.appendChild(el("span", "s-wn-page__date", lang === "ar" ? "الأحد، 13 سبتمبر" : "Sunday, September 13"));
  head.appendChild(el("span", "s-wn-page__title", lang === "ar" ? "الروتين" : "Routines"));
  head.appendChild(el("span", "s-wn-page__lead", lang === "ar" ? "2 من 3 مكتمل اليوم" : "2 of 3 complete today"));
  page.appendChild(head);
  const cards = el("div", "s-wn-page__cards");
  const rows: Record<Lang, [string, number][]> = {
    en: [["Weekly exercise", 1], ["Prayers", 1], ["Sleep", 0]],
    ar: [["تمارين الأسبوع", 1], ["الصلوات", 1], ["النوم", 0]],
  };
  for (const [name, done] of rows[lang]) {
    const c = el("div", `s-wn-mini${done ? " is-done" : ""}`);
    c.appendChild(el("span", "s-wn-mini__title", name));
    const dots = el("span", "s-wn-mini__dots");
    for (let i = 0; i < 7; i++) dots.appendChild(el("i", `s-wn-mini__dot${i < 6 ? " is-on" : ""}`));
    c.appendChild(dots);
    cards.appendChild(c);
  }
  page.appendChild(cards);
  wrap.appendChild(page);
  host.replaceChildren(wrap);
}

// ── 3.12.0: queries and tasks, over the reader's own vault ──────────────────

function queryDemo(host: HTMLElement, lang: Lang): () => void {
  let alive = true;
  void Promise.all([import("../reading/query.ts"), import("../../shared/queryFence.ts")]).then(([mod, q]) => {
    if (!alive) return;
    const spec = q.parseQueryFence(lang === "ar" ? "sort: modified desc\nlimit: 6\nas: table\nshow: title, modified, tags" : "sort: modified desc\nlimit: 6\nas: table\nshow: title, modified, tags");
    host.replaceChildren(mod.renderQueryFence(spec, { notePath: "" }));
  });
  return () => {
    alive = false;
  };
}

function tasksDemo(host: HTMLElement, lang: Lang): () => void {
  let alive = true;
  void lang;
  void Promise.all([import("../reading/tasks.ts"), import("../../shared/tasks.ts")]).then(([mod, tk]) => {
    if (!alive) return;
    const today = isoDate(new Date());
    // The reader's own open tasks when they have any; a sample list when not.
    const spec = tk.parseTasksFence("not done\nlimit: 6", today);
    const sample = [
      { path: "Ledger.md", title: lang === "ar" ? "الدفتر" : "Ledger", tags: [], task: tk.parseTaskLine(`- [ ] ${lang === "ar" ? "اقرأ الفصل الثالث" : "Read chapter 3"} 📅 ${today} ⏫`, 1)! },
      { path: "Ledger.md", title: lang === "ar" ? "الدفتر" : "Ledger", tags: [], task: tk.parseTaskLine(`- [ ] ${lang === "ar" ? "راجع الحسابات" : "Reconcile the accounts"} 📅 ${shiftDate(today, 4)} 🔁 ${lang === "ar" ? "كل أسبوع" : "every week"}`, 2)! },
      { path: "Kitchen.md", title: lang === "ar" ? "المطبخ" : "Kitchen", tags: [], task: tk.parseTaskLine(`- [ ] ${lang === "ar" ? "اشترِ الكمون" : "Buy cumin"} 📅 ${shiftDate(today, -1)}`, 1)! },
    ];
    host.replaceChildren(mod.renderTasksFence(spec, { notePath: "", live: false, rows: sample }));
  });
  return () => {
    alive = false;
  };
}

// ── 3.10.0: Easy on the eyes ────────────────────────────────────────────────

function eyeDemo(host: HTMLElement, lang: Lang): void {
  void lang; // the strings below come from the dictionary, which follows the chrome
  const wrap = el("div", "s-wn-eye");
  const page = el("div", "s-wn-eye__page");
  page.appendChild(el("div", "s-wn-eye__h", lang === "ar" ? "ملاحظة في ضوء المصباح" : "A note by lamplight"));
  for (const w of [92, 78, 85, 60]) {
    const line = el("div", "s-wn-eye__line");
    line.style.inlineSize = `${w}%`;
    page.appendChild(line);
  }
  const sheet = el("div", "s-wn-eye__sheet");
  page.appendChild(sheet);
  wrap.appendChild(page);
  const controls = el("label", "s-wn-eye__ctl");
  controls.appendChild(el("span", "s-wn-eye__label", t("rowScreenWarmth")));
  const range = el("input", "s-wn-eye__range");
  range.type = "range";
  range.min = "0";
  range.max = "100";
  range.value = "55";
  range.setAttribute("aria-label", t("rowScreenWarmth"));
  const value = el("span", "s-wn-eye__value", "55%");
  const apply = (): void => {
    sheet.style.opacity = String(Number(range.value) / 100);
    value.textContent = `${range.value}%`;
  };
  range.addEventListener("input", apply);
  apply();
  controls.appendChild(range);
  controls.appendChild(value);
  wrap.appendChild(controls);
  host.replaceChildren(wrap);
}

// ── The registry ────────────────────────────────────────────────────────────

export const RELEASES: Release[] = [
  {
    version: "3.13.0",
    title: { en: "Fundamentals, and a few joys", ar: "أساسيات، وبعض المسرّات" },
    slides: [
      {
        title: { en: "Bookmarks that travel with the vault", ar: "مفضلة تسافر مع الخزانة" },
        body: {
          en: "Ctrl/Cmd Shift B bookmarks the open note. The list is a note of its own, Bookmarks.md, drawn as a starred section above the tree — readable in Obsidian, on the phone, everywhere the vault goes. Drag a row to reorder.",
          ar: "Ctrl/Cmd Shift B يضيف الملاحظة المفتوحة إلى المفضلة. والقائمة ملاحظة بنفسها، Bookmarks.md، تُرسم قسمًا بنجمة فوق الشجرة: تُقرأ في Obsidian وعلى الهاتف وحيثما تذهب الخزانة. اسحب صفًّا لإعادة الترتيب.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="42" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "BOOKMARKS · 3", "المفضلة · 3")}</text>
  <g fill="var(--text)"><text x="30" y="70"><tspan fill="var(--accent)">★</tspan>  ${L(lang, "The Muqaddima", "المقدمة")}</text><text x="30" y="96"><tspan fill="var(--accent)">★</tspan>  ${L(lang, "Reading list", "قائمة القراءة")}</text><text x="30" y="122"><tspan fill="var(--accent)">★</tspan>  ${L(lang, "Weekly exercise", "تمارين الأسبوع")}</text></g>
  <line x1="30" y1="140" x2="530" y2="140" stroke="var(--border)"/>
  <g fill="var(--text-muted)" font-size="12"><text x="30" y="164">▸ 1 - Source Material</text><text x="30" y="186">▸ Journal</text></g>
  <g font-family="ui-monospace, monospace" font-size="11" fill="var(--text-faint)"><text x="330" y="70">Bookmarks.md</text><text x="330" y="90">- [[The Muqaddima]]</text><text x="330" y="108">- [[Reading list]]</text><text x="330" y="126">- [[Weekly exercise]]</text></g>
</svg>`,
        },
        docs: "workspace",
      },
      {
        title: { en: "Named layouts, and a tag tree", ar: "تخطيطات مسمّاة، وشجرة وسوم" },
        body: {
          en: "Save layout as… keeps your panes and splits under a name; Restore a layout… brings one back, shared with the desktop app. The tag shelf is a tree now: book/fiction and book/history fold under book with one count, sorted by count or by name.",
          ar: "احفظ التخطيط باسم… يحفظ لوحاتك وتقسيماتك تحت اسم؛ واسترجع تخطيطًا… يعيد واحدًا، مشتركًا مع تطبيق سطح المكتب. ورفّ الوسوم شجرة الآن: يُطوى book/fiction وbook/history تحت book بعدد واحد، مرتّبًا بالعدد أو بالاسم.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="250" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="42" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "LAYOUTS", "التخطيطات")}</text>
  <g fill="var(--text)"><text x="30" y="72">${L(lang, "Research", "بحث")}</text><text x="30" y="100">${L(lang, "Writing", "كتابة")}</text><text x="30" y="128">${L(lang, "Reading room", "غرفة القراءة")}</text></g>
  <g fill="var(--accent)" font-size="11"><text x="190" y="72">${L(lang, "RESTORE", "استرجع")}</text><text x="190" y="100">${L(lang, "RESTORE", "استرجع")}</text><text x="190" y="128">${L(lang, "RESTORE", "استرجع")}</text></g>
  <rect x="298" y="12" width="250" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="316" y="42" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "TAGS", "الوسوم")}</text>
  <g fill="var(--text)"><text x="316" y="72"><tspan fill="var(--text-faint)">▾</tspan> #book <tspan fill="var(--text-faint)">42</tspan></text><text x="340" y="96"><tspan fill="var(--text-muted)">#fiction</tspan> <tspan fill="var(--text-faint)">18</tspan></text><text x="340" y="120"><tspan fill="var(--text-muted)">#history</tspan> <tspan fill="var(--text-faint)">24</tspan></text><text x="316" y="148"><tspan fill="var(--text-faint)">▸</tspan> #zettel <tspan fill="var(--text-faint)">131</tspan></text><text x="316" y="176">#recipes <tspan fill="var(--text-faint)">7</tspan></text></g>
</svg>`,
        },
        docs: "workspace",
      },
      {
        title: { en: "A pace, and today's pages", ar: "وتيرة، وصفحات اليوم" },
        body: {
          en: "A tracker takes pace: 20 (or due: a date) and its card says the day you will be done — or the pace that gets you there. A routine that names the book gains \"Read 20 pages of it\" as its first task, and ticking it moves the tracker.",
          ar: "يأخذ المتتبِّع pace: 20 (أو due: تاريخًا) فتقول بطاقته اليوم الذي تنتهي فيه، أو الوتيرة التي تبلغك إياه. والروتين الذي يسمّي الكتاب يكتسب «اقرأ 20 صفحة منه» مهمةً أولى، والتعليم عليها يحرّك المتتبِّع.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="46" fill="var(--text)" font-family="Georgia, serif" font-size="16">${L(lang, "The Muqaddima", "المقدمة")}</text>
  <rect x="30" y="60" width="320" height="8" rx="4" fill="var(--bg-hover)"/><rect x="30" y="60" width="106" height="8" rx="4" fill="var(--accent)"/>
  <text x="30" y="88" fill="var(--text-muted)" font-size="12">100 / 300 ${L(lang, "pages", "صفحة")} · <tspan fill="var(--accent)">20 ${L(lang, "pages a day — done by 24 September", "صفحة في اليوم؛ ينتهي في 24 سبتمبر")}</tspan></text>
  <rect x="30" y="112" width="500" height="80" rx="10" fill="var(--bg)" stroke="var(--border)"/>
  <text x="46" y="136" fill="var(--accent)" font-size="11" letter-spacing="1">${L(lang, "TODAY", "اليوم")}</text>
  <rect x="46" y="150" width="16" height="16" rx="3" fill="none" stroke="var(--accent)" stroke-width="1.5"/><path d="M50 158l4 4 7-8" fill="none" stroke="var(--accent)" stroke-width="2"/>
  <text x="70" y="163" fill="var(--text)">${L(lang, "Read", "اقرأ")} <tspan fill="var(--text-muted)">20 ${L(lang, "pages of The Muqaddima", "صفحة من المقدمة")}</tspan></text>
  <text x="46" y="184" fill="var(--text-faint)" font-size="11">${L(lang, "→ the tracker moves to 120 / 300", "→ ينتقل المتتبِّع إلى 120 / 300")}</text>
</svg>`,
        },
        docs: "routines",
      },
    ],
  },
  {
    version: "3.12.0",
    title: { en: "The vault, woven", ar: "الخزانة منسوجة" },
    slides: [
      {
        title: { en: "Live queries in a note", ar: "استعلامات حيّة في ملاحظة" },
        body: {
          en: "A query fence lists the notes that answer a search — tag:reading prop:status=reading — as a list, a table or cards, sorted and capped as you say, live wherever the note is read. This one is your own vault, right now.",
          ar: "سياج query يعدّد الملاحظات التي تجيب عن بحث — tag:reading prop:status=reading — قائمةً أو جدولًا أو بطاقات، مرتبةً ومحدودةً كما تقول، حيّةً حيثما تُقرأ الملاحظة. وهذا هو خزانتك الآن.",
        },
        visual: { kind: "demo", mount: queryDemo },
        docs: "editor",
      },
      {
        title: { en: "Tasks across the vault", ar: "المهام عبر الخزانة" },
        body: {
          en: "Every - [ ] line is a task, with the Tasks plugin's fields read off its end: 📅 due, ⏫ priority, 🔁 recurrence. A tasks fence gathers them — not done, due this week — and a tick flips the one line where the task lives, stamped ✅ today.",
          ar: "كل سطر - [ ] مهمة، تُقرأ من آخره حقول إضافة Tasks: 📅 الاستحقاق، ⏫ الأولوية، 🔁 التكرار. سياج tasks يجمعها — not done، due this week — والتعليم يقلب السطر الواحد الذي تسكنه المهمة مختومًا بـ✅ اليوم.",
        },
        visual: { kind: "demo", mount: tasksDemo },
        docs: "editor",
      },
      {
        title: { en: "Block references", ar: "مراجع الفقرات" },
        body: {
          en: "End a paragraph with ^id and it has an address: [[Note#^id]] links to it, ![[Note#^id]] transcludes just that block, the hover card shows it. Copy link to this block in the palette mints the id for you.",
          ar: "اختم فقرة بـ^id فيصير لها عنوان: [[Note#^id]] يربط إليها، و![[Note#^id]] يضمّن تلك الفقرة وحدها، وبطاقة التمرير تعرضها. ونسخ رابط هذه الفقرة في اللوحة يسكّ المعرّف لك.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 250" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="250" height="226" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="40" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "LEDGER", "الدفتر")}</text>
  <text x="30" y="72" fill="var(--text)">${L(lang, "The rule of three:", "قاعدة الثلاثة:")}</text>
  <text x="30" y="92" fill="var(--text)">${L(lang, "never keep fewer than", "لا تحتفظ بأقل من")}</text>
  <text x="30" y="112" fill="var(--text)">${L(lang, "three copies.", "ثلاث نسخ.")} <tspan fill="var(--text-faint)" font-family="ui-monospace, monospace" font-size="11">^rule3</tspan></text>
  <rect x="298" y="12" width="250" height="226" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="316" y="40" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "JOURNAL", "اليوميات")}</text>
  <text x="316" y="72" fill="var(--text)">${L(lang, "See", "انظر")} <tspan fill="var(--accent)">[[Ledger#^rule3]]</tspan></text>
  <rect x="316" y="92" width="214" height="86" rx="8" fill="var(--bg)" stroke="var(--accent)" stroke-opacity="0.5"/>
  <text x="330" y="114" fill="var(--accent)" font-size="11">Ledger › ^rule3</text>
  <text x="330" y="136" fill="var(--text)" font-size="12">${L(lang, "The rule of three: never", "قاعدة الثلاثة: لا تحتفظ")}</text>
  <text x="330" y="154" fill="var(--text)" font-size="12">${L(lang, "keep fewer than three copies.", "بأقل من ثلاث نسخ.")}</text>
  <path d="M262 100 C 285 100, 285 100, 298 100" stroke="var(--accent)" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/>
</svg>`,
        },
        docs: "editor",
      },
      {
        title: { en: "Unlinked mentions", ar: "إشارات غير مرتبطة" },
        body: {
          en: "Under the backlinks, the notes that name the open note without linking it — whole words, folded like search — each with a Link button that wraps the words as [[Note]] in one edit. Link all does the lot. This is how atomic notes get woven.",
          ar: "تحت الروابط الخلفية، الملاحظات التي تسمّي الملاحظة المفتوحة من غير رابط — كلمات كاملة، مطويّة كما في البحث — لكلٍّ زر اربط يلفّ الكلمات [[Note]] بتعديل واحد. واربط الكل يفعلها كلها. هكذا تُنسج الملاحظات الذرية.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="42" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "UNLINKED MENTIONS · 3", "إشارات غير مرتبطة · 3")}</text>
  <g transform="translate(30 60)">
    <text y="16" fill="var(--text)" font-weight="500">${L(lang, "Journal", "اليوميات")}</text>
    <text y="38" fill="var(--text-muted)" font-size="12">${L(lang, "Today I read the", "اليوم قرأت")} <tspan fill="var(--text)" text-decoration="underline">${L(lang, "Ledger", "الدفتر")}</tspan> ${L(lang, "and thought about it.", "وفكّرت فيه.")}</text>
    <rect x="440" y="22" width="64" height="24" rx="6" fill="var(--bg)" stroke="var(--accent)"/><text x="472" y="38" text-anchor="middle" fill="var(--accent)" font-size="11">${L(lang, "LINK", "اربط")}</text>
  </g>
  <g transform="translate(30 116)">
    <text y="16" fill="var(--text)" font-weight="500">${L(lang, "Monday", "الاثنين")}</text>
    <text y="38" fill="var(--text-muted)" font-size="12">${L(lang, "…wrote in", "…كتبت في")} <tspan fill="var(--text)" text-decoration="underline">${L(lang, "the book of accounts", "دفتر الحسابات")}</tspan> ${L(lang, "after lunch.", "بعد الغداء.")}</text>
    <rect x="440" y="22" width="64" height="24" rx="6" fill="var(--bg)" stroke="var(--border)"/><text x="472" y="38" text-anchor="middle" fill="var(--text-muted)" font-size="11">${L(lang, "LINK", "اربط")}</text>
  </g>
  <g transform="translate(30 172)">
    <text y="16" fill="var(--text-faint)" font-size="12">${L(lang, "→ becomes", "→ يصير")} <tspan fill="var(--accent)">[[Ledger|the book of accounts]]</tspan></text>
  </g>
</svg>`,
        },
        docs: "editor",
      },
      {
        title: { en: "Daily and weekly notes, your way", ar: "الملاحظات اليومية والأسبوعية على طريقتك" },
        body: {
          en: "The daily note's folder, name and template are settings now — YYYY/YYYY-MM-DD files each year in its own folder — and a weekly note joins it. Yesterday's note and Tomorrow's note walk from the day you are on, and On this day reads the archive back: what you wrote or finished on this date in earlier years.",
          ar: "مجلد الملاحظة اليومية واسمها وقالبها إعدادات الآن — YYYY/YYYY-MM-DD يودع كل سنة في مجلدها — وتنضم إليها ملاحظة أسبوعية. ملاحظة الأمس وملاحظة الغد تمشيان من اليوم الذي أنت فيه، وفي مثل هذا اليوم يقرأ عليك أرشيفك: ما كتبته أو أنهيته في هذا التاريخ من سنوات مضت.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 230" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="206" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <g font-family="ui-monospace, monospace" font-size="12">
    <text x="30" y="44" fill="var(--text-muted)">Journal/</text>
    <text x="50" y="66" fill="var(--text-muted)">2025/</text>
    <text x="70" y="88" fill="var(--text-faint)">2025-09-13.md</text>
    <text x="50" y="110" fill="var(--text-muted)">2026/</text>
    <text x="70" y="132" fill="var(--text-faint)">2026-09-12.md</text>
    <text x="70" y="154" fill="var(--text)">2026-09-13.md  <tspan fill="var(--accent)">${L(lang, "← today", "← اليوم")}</tspan></text>
    <text x="70" y="176" fill="var(--text-faint)">2026-W37.md</text>
  </g>
  <g transform="translate(300 40)">
    <text y="0" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "ON THIS DAY", "في مثل هذا اليوم")}</text>
    <text y="30" fill="var(--accent)" font-size="11">${L(lang, "1Y AGO", "قبل سنة")}</text><text x="60" y="30" fill="var(--text)">${L(lang, "you wrote “On Marginalia”", "كتبت «في الهوامش»")}</text>
    <text y="56" fill="var(--accent)" font-size="11">${L(lang, "2Y AGO", "قبل سنتين")}</text><text x="60" y="56" fill="var(--text)">${L(lang, "you finished “Elden Ring”", "أنهيت «إلدن رينغ»")}</text>
    <text y="96" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "PALETTE", "اللوحة")}</text>
    <text y="122" fill="var(--text)">${L(lang, "Yesterday's note · Tomorrow's note", "ملاحظة الأمس · ملاحظة الغد")}</text>
    <text y="146" fill="var(--text)">${L(lang, "This week's note · Random note", "ملاحظة هذا الأسبوع · ملاحظة عشوائية")}</text>
  </g>
</svg>`,
        },
        docs: "templates-and-notes",
      },
      {
        title: { en: "Every save keeps what it replaced", ar: "كل حفظ يحتفظ بما استبدله" },
        body: {
          en: "Forty versions per note, with or without git, in one History timeline beside your commits — each a tap from being read or restored. A bad paste over a good paragraph is no longer final.",
          ar: "أربعون نسخة لكل ملاحظة، مع git أو بدونه، في خط زمني واحد في السجل إلى جانب إيداعاتك، وكل نسخة على بعد نقرة من القراءة أو الاسترجاع. اللصق السيئ فوق فقرة جيدة لم يعد نهائيًا.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="42" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "HISTORY", "السجل")}</text>
  <line x1="44" y1="60" x2="44" y2="190" stroke="var(--border)" stroke-width="2"/>
  <g transform="translate(44 72)"><circle r="5" fill="var(--accent)"/><text x="18" y="4" fill="var(--text)">${L(lang, "Before a restore", "قبل استرجاع")}</text><text x="18" y="22" fill="var(--text-faint)" font-size="11">${L(lang, "2 minutes ago · 1.2 kB", "قبل دقيقتين · 1.2 ك.ب")}</text></g>
  <g transform="translate(44 118)"><circle r="5" fill="var(--bg)" stroke="var(--accent)" stroke-width="2"/><text x="18" y="4" fill="var(--text)">${L(lang, "Autosave", "حفظ تلقائي")}</text><text x="18" y="22" fill="var(--text-faint)" font-size="11">${L(lang, "yesterday · 1.1 kB ·", "أمس · 1.1 ك.ب ·")} <tspan fill="var(--accent)">${L(lang, "Restore", "استرجع")}</tspan></text></g>
  <g transform="translate(44 164)"><circle r="5" fill="var(--bg)" stroke="var(--border)" stroke-width="2"/><text x="18" y="4" fill="var(--text)">${L(lang, "Commit 4afec81", "إيداع 4afec81")}</text><text x="18" y="22" fill="var(--text-faint)" font-size="11">${L(lang, "3 days ago · git", "قبل 3 أيام · git")}</text></g>
</svg>`,
        },
        docs: "backup-and-sync",
      },
      {
        title: { en: "Search inside every book", ar: "ابحث داخل كل كتاب" },
        body: {
          en: "The search box now reads every PDF on your shelf: a book page appears beside your notes with its page number, and a click opens the reader right there. in:books or in:notes picks a side; the shelf is read once, in the background.",
          ar: "صندوق البحث يقرأ الآن كل ملف PDF على رفّك: تظهر صفحة الكتاب بجانب ملاحظاتك مع رقمها، والنقر يفتح القارئ عليها مباشرة. in:books أو in:notes يختار جانبًا؛ ويُقرأ الرف مرة واحدة في الخلفية.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <rect x="30" y="30" width="500" height="32" rx="8" fill="var(--bg)" stroke="var(--border)"/>
  <text x="44" y="51" fill="var(--text)">zephyr</text>
  <g transform="translate(30 80)">
    <text y="14" fill="var(--text)" font-weight="500">${L(lang, "Marginalia", "الهوامش")}</text><text x="120" y="14" fill="var(--text-faint)" font-size="11">${L(lang, "note", "ملاحظة")}</text>
    <text y="34" fill="var(--text-muted)" font-size="12">${L(lang, "…a", "…نسيم")} <tspan fill="var(--accent)">zephyr</tspan> ${L(lang, "through the margins of the book…", "في هوامش الكتاب…")}</text>
  </g>
  <g transform="translate(30 134)">
    <rect x="-8" y="-14" width="516" height="52" rx="8" fill="color-mix(in srgb, var(--accent) 8%, transparent)"/>
    <text y="14" fill="var(--text)" font-weight="500">${L(lang, "A Treatise on Winds", "رسالة في الرياح")}</text><text x="190" y="14" fill="var(--accent)" font-size="11">${L(lang, "book page · p. 42", "صفحة كتاب · ص 42")}</text>
    <text y="34" fill="var(--text-muted)" font-size="12">${L(lang, "…the western", "…الغربي")} <tspan fill="var(--accent)">zephyr</tspan> ${L(lang, "arrives before the rains…", "يصل قبل الأمطار…")}</text>
  </g>
</svg>`,
        },
        docs: "books",
      },
      {
        title: { en: "Export, in any shape", ar: "تصدير بأي شكل" },
        body: {
          en: "Export… puts a note, a folder, a tag or the whole vault into a ZIP with the pictures they use, wikilinks kept or turned into standard links. One note can leave as a single HTML page that carries your theme and its images inside it. Nothing leaves the machine.",
          ar: "تصدير… يضع ملاحظة أو مجلدًا أو وسمًا أو الخزانة كلها في ملف ZIP مع الصور التي تستعملها، بروابط ويكية كما هي أو محوَّلة إلى روابط قياسية. ويمكن لملاحظة واحدة أن تخرج صفحةَ HTML واحدة تحمل سمتك وصورها في داخلها. لا شيء يغادر الجهاز.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="42" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "EXPORT…", "تصدير…")}</text>
  <g transform="translate(30 60)">
    <rect width="96" height="28" rx="14" fill="var(--bg)" stroke="var(--border)"/><text x="48" y="18" text-anchor="middle" fill="var(--text-muted)" font-size="12">${L(lang, "This note", "هذه الملاحظة")}</text>
    <rect x="104" width="96" height="28" rx="14" fill="color-mix(in srgb, var(--accent) 16%, var(--bg))" stroke="var(--accent)"/><text x="152" y="18" text-anchor="middle" fill="var(--text)" font-size="12">${L(lang, "This folder", "هذا المجلد")}</text>
    <rect x="208" width="72" height="28" rx="14" fill="var(--bg)" stroke="var(--border)"/><text x="244" y="18" text-anchor="middle" fill="var(--text-muted)" font-size="12">${L(lang, "A tag", "وسم")}</text>
    <rect x="288" width="110" height="28" rx="14" fill="var(--bg)" stroke="var(--border)"/><text x="343" y="18" text-anchor="middle" fill="var(--text-muted)" font-size="12">${L(lang, "Whole vault", "الخزانة كلها")}</text>
  </g>
  <g font-family="ui-monospace, monospace" font-size="12" transform="translate(30 116)">
    <text y="0" fill="var(--text)">Essays 2026-09-14.zip</text>
    <text x="20" y="22" fill="var(--text-muted)">Essays/Deep note.md</text>
    <text x="20" y="42" fill="var(--text-muted)">Essays/On Marginalia.md</text>
    <text x="20" y="62" fill="var(--text-muted)">Media/cover.png</text>
  </g>
  <text x="330" y="140" fill="var(--text-faint)" font-size="12">[[Deep note]] →</text>
  <text x="330" y="160" fill="var(--accent)" font-size="12">[Deep note](Deep%20note.md)</text>
</svg>`,
        },
        docs: "export",
      },
    ],
  },
  {
    version: "3.11.0",
    title: { en: "Routines", ar: "الروتين" },
    slides: [
      {
        title: { en: "A plan you follow by the day", ar: "خطة تتبعها يومًا بيوم" },
        body: {
          en: "An exercise week, the five prayers, sleep, water — a routine is a card about your days. Today's checklist, the numbers you keep, a streak that lights, the week as seven dots and twelve weeks as a heatmap. Tick a box on this one.",
          ar: "أسبوع تمارين، الصلوات الخمس، النوم، الماء: الروتين بطاقة عن أيامك. قائمة اليوم، والأرقام التي تحفظها، وسلسلة تضيء، والأسبوع سبع نقاط، واثنا عشر أسبوعًا خريطة حرارية. علّم على مربع في هذه.",
        },
        visual: { kind: "demo", mount: routineDemo },
        docs: "routines",
      },
      {
        title: { en: "The note is the state", ar: "الملاحظة هي الحالة" },
        body: {
          en: "Two fences in one note: the plan, and the log Astrolabe writes under it — one readable line per day. Tick and a line changes in your file; edit the line by hand and the card follows. Obsidian reads both as plain code blocks.",
          ar: "سياجان في ملاحظة واحدة: الخطة، والسجل الذي يكتبه أسطرلاب تحتها؛ سطر مقروء لكل يوم. علّم فيتغير سطر في ملفك؛ عدّل السطر بيدك فتتبعه البطاقة. وObsidian يقرأ كليهما كتلتي كود عاديتين.",
        },
        visual: {
          kind: "svg",
          svg: `<svg viewBox="0 0 560 260" xmlns="http://www.w3.org/2000/svg" font-family="ui-monospace, monospace" font-size="13">
  <rect x="12" y="12" width="536" height="236" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="32" y="46" fill="var(--text-faint)">\`\`\`routine</text>
  <text x="32" y="68" fill="var(--text)">title: <tspan fill="var(--accent)">Weekly exercise</tspan></text>
  <text x="32" y="90" fill="var(--text)">slots: <tspan fill="var(--accent)">morning, evening</tspan></text>
  <text x="32" y="112" fill="var(--text)">monday:</text>
  <text x="52" y="134" fill="var(--text-muted)">morning: 60 min brisk walk</text>
  <text x="32" y="156" fill="var(--text-faint)">\`\`\`</text>
  <text x="32" y="190" fill="var(--text-faint)">\`\`\`routine-log</text>
  <text x="32" y="212" fill="var(--text)"><tspan fill="var(--accent)">2026-09-14</tspan> | done: morning, evening | minutes: 62</text>
  <text x="32" y="234" fill="var(--text-faint)">\`\`\`</text>
  <g transform="translate(470 196)"><circle r="14" fill="var(--callout-success, var(--accent))" opacity="0.18"/><path d="M-6 0l4 4 8-9" fill="none" stroke="var(--callout-success, var(--accent))" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>
</svg>`,
        },
      },
      {
        title: { en: "The Routines page, and templates", ar: "صفحة الروتين، والقوالب" },
        body: {
          en: "The calendar button beside the gear opens every routine as today's checklists. New routine starts from a template — an exercise week, prayers, sleep, water, mood, reading, study — or from one of your own, saved with one click.",
          ar: "زر التقويم بجانب الترس يفتح كل روتين قوائمَ لليوم. روتين جديد يبدأ من قالب: أسبوع تمارين، صلاة، نوم، ماء، مزاج، قراءة، دراسة؛ أو من قالب لك تحفظه بنقرة واحدة.",
        },
        visual: { kind: "demo", mount: templatesDemo },
        docs: "routines",
      },
    ],
  },
  {
    version: "3.10.0",
    title: { en: "Easy on the eyes", ar: "راحة للعين" },
    slides: [
      {
        title: { en: "Warm the screen, dim the page", ar: "دفّئ الشاشة، عتّم الصفحة" },
        body: {
          en: "Two sliders on Settings → This device that sit over any theme: an amber sheet like a phone's night light, and a dimmer below what your monitor reaches. Per device, never printed. The palette's Warm the screen is the one-key switch.",
          ar: "منزلقان في الإعدادات ← هذا الجهاز يجلسان فوق أي سمة: طبقة كهرمانية كالإضاءة الليلية في الهاتف، ومعتّم يهبط تحت ما تبلغه شاشتك. لكل جهاز، ولا يُطبع. ودفّئ الشاشة في اللوحة مفتاحه الواحد.",
        },
        visual: { kind: "demo", mount: eyeDemo },
        docs: "theming",
      },
    ],
  },
];

export function releaseFor(version: string): Release | undefined {
  return RELEASES.find((r) => r.version === version);
}
