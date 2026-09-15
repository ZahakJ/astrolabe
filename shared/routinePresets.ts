// THE ORBIT PRESETS — what the form offers before the vault has templates.
//
// In a file of their own, away from shared/routine.ts, because the model is
// in the ENTRY chunk (render.ts and the live preview parse a fence before
// anything paints) and these are two languages of plan text that only the
// form ever reads. The form is a lazy chunk; so are they.

import { emptyDraft, type RoutineDraft, type RoutineKind } from "./routine.ts";

// ── Presets ─────────────────────────────────────────────────────────────────

/** The templates the form offers before the vault has any of its own. Each
 *  is a draft in one language; the form shows the instance's. The exercise
 *  plan is the owner's own week, which is how this feature began.
 *
 *  A preset's `fields` are SUGGESTIONS: the form pre-ticks them and the
 *  reader unticks what they do not want — the owner keeps no minutes and no
 *  weight on their exercise sigil, and nothing here forces either. */
export interface RoutinePreset {
  id: RoutineKind;
  draft: (lang: "en" | "ar") => RoutineDraft;
}

function preset(en: Partial<RoutineDraft>, ar: Partial<RoutineDraft>): (lang: "en" | "ar") => RoutineDraft {
  return (lang) => ({ ...emptyDraft(), ...(lang === "ar" ? ar : en), week: { ...emptyDraft().week, ...((lang === "ar" ? ar : en).week ?? {}) } });
}

export const ROUTINE_PRESETS: RoutinePreset[] = [
  {
    id: "exercise",
    draft: preset(
      {
        title: "Weekly exercise",
        kind: "exercise",
        icon: "🏃",
        slots: ["morning", "evening"],
        fields: ["minutes:number", "weight:number:kg"],
        target: 6,
        week: {
          mon: { morning: "60 min brisk walk", evening: "Full Body A: leg press 3×8–12, chest press 3×8–12, lat pulldown 3×8–12, hamstring curl 3×10–15, plank 3×45 sec" },
          tue: { morning: "60 min easy walk", evening: "Bike or elliptical 35–45 min, comfortable pace + 10 min abs" },
          wed: { morning: "60 min walk", evening: "Full Body B: goblet squat or leg press 3×8–12, seated row 3×8–12, shoulder press 3×8–12, Romanian deadlift 3×8–10, hanging/knee raises 3×10–15" },
          thu: { morning: "Easy walk", evening: "Recovery cardio: 30–45 min easy bike/walk. No hard leg work" },
          fri: { morning: "60 min walk", evening: "Full Body A/B, alternating each week. Finish with 15–20 min easy cardio" },
          sat: { morning: "Long bike ride, 45–75 min", evening: "Optional stretching/mobility; otherwise relax" },
          sun: { morning: "60 min walk", evening: "Rest + meal prep. No hard training" },
        },
      },
      {
        title: "تمارين الأسبوع",
        kind: "رياضة",
        icon: "🏃",
        slots: ["صباحًا", "مساءً"],
        fields: ["دقائق:number", "الوزن:number:كغ"],
        target: 6,
        week: {
          mon: { "صباحًا": "مشي سريع 60 دقيقة", "مساءً": "جسم كامل أ: ضغط الأرجل 3×8–12، ضغط الصدر 3×8–12، سحب علوي 3×8–12، ثني الفخذ الخلفي 3×10–15، بلانك 3×45 ثانية" },
          tue: { "صباحًا": "مشي خفيف 60 دقيقة", "مساءً": "دراجة أو إليبتيكال 35–45 دقيقة بوتيرة مريحة + 10 دقائق بطن" },
          wed: { "صباحًا": "مشي 60 دقيقة", "مساءً": "جسم كامل ب: قرفصاء بالدمبل أو ضغط الأرجل 3×8–12، تجديف جالس 3×8–12، ضغط الكتف 3×8–12، رفعة رومانية 3×8–10، رفع الركبتين 3×10–15" },
          thu: { "صباحًا": "مشي خفيف", "مساءً": "كارديو استشفاء: 30–45 دقيقة دراجة أو مشي خفيف. لا تمارين أرجل ثقيلة" },
          fri: { "صباحًا": "مشي 60 دقيقة", "مساءً": "جسم كامل أ/ب بالتناوب كل أسبوع، ثم 15–20 دقيقة كارديو خفيف" },
          sat: { "صباحًا": "جولة دراجة طويلة، 45–75 دقيقة", "مساءً": "إطالة ومرونة اختياريًا؛ وإلا فاسترخِ" },
          sun: { "صباحًا": "مشي 60 دقيقة", "مساءً": "راحة + تحضير الوجبات. لا تدريب شاق" },
        },
      },
    ),
  },
  {
    id: "habit",
    draft: preset(
      { title: "Daily habits", kind: "habit", icon: "🌱", items: ["Read 20 pages", "Drink 2 L water", "No phone after 22:00", "Tidy the desk"], target: 7 },
      { title: "عادات يومية", kind: "عادات", icon: "🌱", items: ["قراءة 20 صفحة", "شرب لترين من الماء", "لا هاتف بعد 22:00", "ترتيب المكتب"], target: 7 },
    ),
  },
  {
    id: "prayer",
    draft: preset(
      { title: "Prayers", kind: "prayer", icon: "🕌", items: ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"], fields: ["in congregation:count", "quran pages:count"], target: 7 },
      { title: "الصلوات", kind: "صلاة", icon: "🕌", items: ["الفجر", "الظهر", "العصر", "المغرب", "العشاء"], fields: ["في جماعة:count", "صفحات القرآن:count"], target: 7 },
    ),
  },
  {
    id: "sleep",
    draft: preset(
      { title: "Sleep", kind: "sleep", icon: "🌙", fields: ["hours:number", "quality:scale:5", "bedtime:text"], target: 7 },
      { title: "النوم", kind: "نوم", icon: "🌙", fields: ["ساعات:number", "الجودة:scale:5", "وقت النوم:text"], target: 7 },
    ),
  },
  {
    id: "water",
    draft: preset(
      { title: "Water", kind: "water", icon: "💧", items: ["8 glasses"], fields: ["water:count:glasses"], target: 7 },
      { title: "الماء", kind: "ماء", icon: "💧", items: ["8 أكواب"], fields: ["ماء:count:أكواب"], target: 7 },
    ),
  },
  {
    id: "mood",
    draft: preset(
      { title: "Mood journal", kind: "mood", icon: "🙂", fields: ["mood:scale:5", "energy:scale:5", "gratitude:text"], target: 7 },
      { title: "يوميات المزاج", kind: "مزاج", icon: "🙂", fields: ["المزاج:scale:5", "الطاقة:scale:5", "امتنان:text"], target: 7 },
    ),
  },
  {
    id: "reading",
    draft: preset(
      { title: "Daily reading", kind: "reading", icon: "📖", items: ["Read"], fields: ["pages:count", "book:text"], target: 6 },
      { title: "قراءة يومية", kind: "قراءة", icon: "📖", items: ["قراءة"], fields: ["صفحات:count", "الكتاب:text"], target: 6 },
    ),
  },
  {
    id: "study",
    draft: preset(
      { title: "Study", kind: "study", icon: "📚", items: ["Deep work block", "Review notes"], fields: ["minutes:number", "focus:scale:5"], target: 5 },
      { title: "الدراسة", kind: "دراسة", icon: "📚", items: ["جلسة تركيز عميق", "مراجعة الملاحظات"], fields: ["دقائق:number", "التركيز:scale:5"], target: 5 },
    ),
  },
];
