---
title: Sigils
---

# Sigils

A **sigil** is a seal you set on the day — an exercise week, the five prayers, sleep, water — with a plan for each day and a log of every day you kept it. It is two blocks in one note: the plan, and the log the app writes under it the first time you tick something. Open **Sigils** (the small seal button beside the gear, or *Open Sigils* in the palette) to see every sigil as today's checklist.

```sigil
title: Weekly exercise
kind: exercise
icon: 🏃
slots: morning, evening
fields: minutes:number, weight:number:kg
target: 6/week
monday:
  morning: 60 min brisk walk
  evening: Full Body A: leg press 3×8–12, chest press 3×8–12, lat pulldown 3×8–12, hamstring curl 3×10–15, plank 3×45 sec
tuesday:
  morning: 60 min easy walk
  evening: Bike or elliptical 35–45 min, comfortable pace + 10 min abs
wednesday:
  morning: 60 min walk
  evening: Full Body B: goblet squat or leg press 3×8–12, seated row 3×8–12, shoulder press 3×8–12, Romanian deadlift 3×8–10, hanging/knee raises 3×10–15
thursday:
  morning: Easy walk
  evening: Recovery cardio: 30–45 min easy bike/walk. No hard leg work
friday:
  morning: 60 min walk
  evening: Full Body A/B, alternating each week. Finish with 15–20 min easy cardio
saturday:
  morning: Long bike ride, 45–75 min
  evening: Optional stretching/mobility; otherwise relax
sunday:
  morning: 60 min walk
  evening: Rest + meal prep. No hard training
```

```sigil-log
```

Tick a box on the card and a line lands in the log — `2026-09-13 | done: morning, evening | minutes: 62`. Edit the line by hand and the card follows. A plan with no weekdays works too: `items: Fajr, Dhuhr, Asr, Maghrib, Isha` asks the same of every day, and `fields:` keeps whatever you want to write down — `hours:number`, `focus:scale:5` (how focused you were, 1 to 5), `water:count:glasses`, `stretched:check`. An `icon:` line gives the card its own emoji, and a `banner:` line a picture across its top. A slot that links a study deck — `review: [[Orbits/Hiragana]]` — shows how many cards are due and ticks itself when a session leaves none. Notes written before 3.16 called these blocks `orbit` and `orbit-log`, and before 3.15 `routine` and `routine-log`; those names still work. <!-- lineage -->
