// Discord presence, the client half (docs/presence.md): what one tab REPORTS
// from the store it reads, and what the Settings → Discord status row SAYS
// for each state the server can be in.
//
// The reporter itself (client/presence/report.ts) is a lazy chunk with a
// store, a window and timers; what it SAYS is `deriveReport`, which is pure,
// and that is what this holds — every surface of the plan's table, the idle
// rule for a hidden tab, and the one thing a report must never carry (a
// title made on the client, which the server's policy would not have seen).

import "../client/i18n/both.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveReport, mintClientId, sameSubject, type PresenceInputs } from "../client/presence/derive.ts";
import { getOrbitsLeft, onOrbitsLeft, setOrbitsLeft } from "../client/presence/orbitsLeft.ts";
import { presenceStatusLines } from "../client/components/settings/presenceStatus.ts";
import type { Pane, Workspace } from "../client/workspace.ts";
import type { PresenceStatus } from "../shared/presence/types.ts";
import { setLang, t } from "../client/i18n.ts";

function pane(id: string, paths: string[], mode: Pane["mode"] = "edit", follow: Pane["follow"] = null): Pane {
  return { id, tabs: paths.map((path) => ({ path, pinned: false, ephemeral: false })), active: paths.length - 1, mode, follow, bookTarget: null };
}

function ws(panes: Pane[], focus = panes[0].id, noteFocus = panes[0].id): Workspace {
  return {
    panes: Object.fromEntries(panes.map((p) => [p.id, p])),
    layout: { columns: [panes.map((p) => p.id)], colWeights: [1], rowWeights: Object.fromEntries(panes.map((p) => [p.id, 1 / panes.length])) },
    focus,
    noteFocus,
    layoutName: null,
  };
}

const NOW = 1_000_000;
function inputs(workspace: Workspace, extra: Partial<PresenceInputs> = {}): PresenceInputs {
  return { workspace, readingMode: false, client: "AbCdEfGh12345678", cardsLeft: null, hiddenAt: null, ...extra };
}

describe("a tab's report, surface by surface", () => {
  it("a note in the editor is writing, with its path; reading mode makes it reading", () => {
    const w = ws([pane("p1", ["Drafts/Chapter 3.md"])]);
    assert.deepEqual(deriveReport(inputs(w), NOW - 4_000, NOW), { client: "AbCdEfGh12345678", kind: "writing", path: "Drafts/Chapter 3.md", idleMs: 4_000 });
    assert.equal(deriveReport(inputs(w, { readingMode: true }), NOW, NOW).kind, "reading");
    assert.equal(deriveReport(inputs(ws([pane("p1", ["a.md"], "reading")])), NOW, NOW).kind, "reading");
  });

  it("a book, a drawing, the library and the media shelf", () => {
    assert.deepEqual(deriveReport(inputs(ws([pane("p1", ["Books/Muqaddimah.pdf"])])), NOW, NOW), { client: "AbCdEfGh12345678", kind: "book", path: "Books/Muqaddimah.pdf", idleMs: 0 });
    assert.equal(deriveReport(inputs(ws([pane("p1", ["Books/x.epub"])])), NOW, NOW).kind, "book");
    const drawing = deriveReport(inputs(ws([pane("p1", ["Sketches/plan.excalidraw.md"])])), NOW, NOW);
    assert.equal(drawing.kind, "drawing");
    assert.equal(drawing.path, "Sketches/plan.excalidraw.md");
    const library = deriveReport(inputs(ws([pane("p1", [], "library")])), NOW, NOW);
    assert.equal(library.kind, "library");
    assert.equal(library.path, undefined);
    assert.equal(deriveReport(inputs(ws([pane("p1", ["~media"])])), NOW, NOW).kind, "library");
  });

  it("an Orbits session is the deck with its cards left; the shelf is browsing", () => {
    const session = deriveReport(inputs(ws([pane("p1", ["~orbits/Decks/Arabic verbs.md"])]), { cardsLeft: 12 }), NOW, NOW);
    assert.deepEqual(session, { client: "AbCdEfGh12345678", kind: "orbits", path: "Decks/Arabic verbs.md", cardsLeft: 12, idleMs: 0 });
    const section = deriveReport(inputs(ws([pane("p1", ["~orbits/Decks/Arabic verbs.md#Lesson 3"])]), { cardsLeft: 3 }), NOW, NOW);
    assert.equal(section.path, "Decks/Arabic verbs.md");
    // The implicit deck has no note, so no path; the count still goes.
    const implicit = deriveReport(inputs(ws([pane("p1", ["~orbits/*"])]), { cardsLeft: 5 }), NOW, NOW);
    assert.equal(implicit.kind, "orbits");
    assert.equal(implicit.path, undefined);
    assert.equal(implicit.cardsLeft, 5);
    const shelf = deriveReport(inputs(ws([pane("p1", ["~orbits"])]), { cardsLeft: 5 }), NOW, NOW);
    assert.equal(shelf.kind, "browsing");
    assert.equal(shelf.cardsLeft, undefined, "a count belongs to a session only");
  });

  it("every other surface is browsing, with no subject", () => {
    for (const path of ["~graph", "~sigils", "~calendar", "~today", "~timeline", "~feeds", "~review-week"]) {
      const r = deriveReport(inputs(ws([pane("p1", [path])])), NOW, NOW);
      assert.equal(r.kind, "browsing", path);
      assert.equal(r.path, undefined, path);
    }
    assert.equal(deriveReport(inputs(ws([pane("p1", [])])), NOW, NOW).kind, "browsing", "an empty pane");
    assert.equal(deriveReport(inputs(ws([pane("p1", ["a.md"], "graph")])), NOW, NOW).kind, "browsing", "the local graph");
  });

  it("reads the FOCUSED pane: a book beside a note, with the keyboard in the book, is the book", () => {
    const w = ws([pane("p1", ["Notes/On time.md"]), pane("p2", ["Books/Confessions.pdf"])], "p2", "p1");
    assert.equal(deriveReport(inputs(w), NOW, NOW).kind, "book");
    // A follower pane renders the note-focus pane's note, and so reports it.
    const f = ws([pane("p1", ["Notes/On time.md"]), pane("p2", [], "reading", "note")], "p2", "p1");
    assert.deepEqual([deriveReport(inputs(f), NOW, NOW).kind, deriveReport(inputs(f), NOW, NOW).path], ["reading", "Notes/On time.md"]);
  });

  it("never carries a title: the server reads the note and judges it", () => {
    const r = deriveReport(inputs(ws([pane("p1", ["Private/Diary.md"])])), NOW, NOW);
    assert.equal("title" in r, false);
  });
});

describe("idle, from the tab's side", () => {
  it("is the time since the last input, never negative", () => {
    const w = ws([pane("p1", ["a.md"])]);
    assert.equal(deriveReport(inputs(w), NOW - 90_000, NOW).idleMs, 90_000);
    assert.equal(deriveReport(inputs(w), NOW + 500, NOW).idleMs, 0);
  });

  it("a hidden tab counts from the moment it was hidden, whatever came after", () => {
    const w = ws([pane("p1", ["a.md"])]);
    assert.equal(deriveReport(inputs(w, { hiddenAt: NOW - 30_000 }), NOW - 1_000, NOW).idleMs, 30_000);
    // Input before it was hidden is older still, and wins.
    assert.equal(deriveReport(inputs(w, { hiddenAt: NOW - 30_000 }), NOW - 60_000, NOW).idleMs, 60_000);
  });

  it("a change is the kind, the path or the count — not the heartbeat's idle time", () => {
    const a = deriveReport(inputs(ws([pane("p1", ["a.md"])])), NOW, NOW);
    assert.equal(sameSubject(a, { ...a, idleMs: 40_000 }), true);
    assert.equal(sameSubject(a, { ...a, path: "b.md" }), false);
    assert.equal(sameSubject(a, { ...a, kind: "reading" }), false);
    assert.equal(sameSubject(a, { ...a, cardsLeft: 3 }), false);
    assert.equal(sameSubject(null, a), false);
  });
});

describe("the tab's id and the session's count", () => {
  it("is sixteen characters of [A-Za-z0-9]", () => {
    const id = mintClientId(new Uint8Array(Array.from({ length: 16 }, (_, i) => i * 37)));
    assert.match(id, /^[A-Za-z0-9]{16}$/);
    // The server takes 8–64 of [A-Za-z0-9_-] (shared/presence/types.ts).
    assert.match(id, /^[A-Za-z0-9_-]{8,64}$/);
  });

  it("the session view's count is told once per change, and null when it leaves", () => {
    const seen: (number | null)[] = [];
    const off = onOrbitsLeft(() => seen.push(getOrbitsLeft()));
    setOrbitsLeft(12);
    setOrbitsLeft(12);
    setOrbitsLeft(11);
    setOrbitsLeft(null);
    setOrbitsLeft(-1);
    off();
    setOrbitsLeft(4);
    assert.deepEqual(seen, [12, 11, null]);
    setOrbitsLeft(null);
  });
});

describe("Settings → Discord → Status, in words", () => {
  const base: PresenceStatus = { enabled: true, mode: "title", applicationId: "set", host: "server", connection: "connected", clients: 1, activity: null };
  const said = (s: PresenceStatus): string[] => presenceStatusLines(s).map((l) => l.key);

  it("names the first thing to fix, in the order a reader fixes them", () => {
    assert.deepEqual(said({ ...base, mode: "off", enabled: false }), ["presenceStatOff"]);
    assert.deepEqual(said({ ...base, applicationId: "placeholder", enabled: false }), ["presenceStatNoId"]);
    assert.deepEqual(said({ ...base, host: "none" }), ["presenceStatNoHost"]);
    assert.deepEqual(said({ ...base, connection: "invalid-id" }), ["presenceStatInvalidId"]);
    assert.deepEqual(said({ ...base, connection: "searching" }), ["presenceStatSearchingServer"]);
    assert.deepEqual(said({ ...base, host: "desktop", connection: "searching" }), ["presenceStatSearchingDesktop"]);
  });

  it("says who is connected and previews what Discord shows", () => {
    const lines = presenceStatusLines({ ...base, activity: { type: 0, details: "Writing", state: "Chapter 3" } });
    assert.deepEqual(lines, [{ key: "presenceStatHostServer" }, { key: "presenceStatShowing", preview: "Writing · Chapter 3" }]);
    assert.deepEqual(said({ ...base, host: "desktop" }), ["presenceStatHostDesktop", "presenceStatShowingNothing"]);
  });

  it("speaks both languages, the Arabic lines opening in Arabic so they read right to left", () => {
    for (const lang of ["en", "ar"] as const) {
      setLang(lang);
      for (const key of ["presenceStatOff", "presenceStatNoId", "presenceStatNoHost", "presenceStatInvalidId", "presenceStatSearchingServer", "presenceStatSearchingDesktop"] as const) {
        const text = t(key);
        assert.ok(text.length > 0, key);
        if (lang === "ar") assert.match(text, /^[؀-ۿ]/, `${key} opens with a Latin word: "${text}"`);
        assert.doesNotMatch(text, /[٠-٩]/, `${key} uses Eastern digits`);
      }
    }
    setLang("en");
  });
});
