// The pocket vault's two rules about other people's writing.
//
// A vault in a pocket has two writers by construction: this phone and the
// laptop that pushes to the same repository. Everything that can go wrong
// between them goes wrong in one of two places, and each of them is a pure
// function that can be held to its promise here rather than discovered on a
// phone at an airport.
//
//   1. THE CONFLICT RULE (mobile/src/pocket/conflict.ts). The phone never
//      merges prose. When both sides changed one note, the remote's version
//      keeps its name and the phone's is set down beside it as
//      `<Note> (phone).md`. Nothing is merged, nothing is discarded.
//   2. THE SYNC LINE (mobile/src/pocket/sync.ts). One line of text is the
//      ONLY account anybody gets of whether their writing has left the phone,
//      so it must never be optimistic. A pending push is always louder than a
//      past success; a conflict is louder still and never ages out.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conflictCommitMessage, phonePathFor, planConflicts, standingConflicts } from "../mobile/src/pocket/conflict.ts";
import { initialSyncState, syncLine, syncReduce, type SyncState } from "../mobile/src/pocket/sync.ts";

const none = (): boolean => false;

describe("the conflict rule — where the phone's version goes", () => {
  it("sets it down beside the note, keeping the extension", () => {
    assert.equal(phonePathFor("Ideas/Astrolabe.md", none), "Ideas/Astrolabe (phone).md");
    assert.equal(phonePathFor("Welcome.md", none), "Welcome (phone).md");
    assert.equal(phonePathFor("Notes/Paper.tex", none), "Notes/Paper (phone).tex");
  });

  it("never overwrites an unresolved conflict from last time", () => {
    const taken = new Set(["Ideas/Astrolabe (phone).md"]);
    assert.equal(phonePathFor("Ideas/Astrolabe.md", (p) => taken.has(p)), "Ideas/Astrolabe (phone) 2.md");
    taken.add("Ideas/Astrolabe (phone) 2.md");
    assert.equal(phonePathFor("Ideas/Astrolabe.md", (p) => taken.has(p)), "Ideas/Astrolabe (phone) 3.md");
  });

  it("treats a leading dot as a name, not an extension", () => {
    assert.equal(phonePathFor(".gitignore", none), ".gitignore (phone)");
  });

  it("is not fooled into a collision inside ONE pull", () => {
    const plan = planConflicts(
      [
        { path: "A.md", ours: "mine", theirs: "theirs" },
        { path: "A.md", ours: "mine again", theirs: "theirs again" },
      ],
      none,
    );
    assert.deepEqual(
      plan.writes.map((w) => w.path),
      ["A (phone).md", "A (phone) 2.md"],
    );
  });

  it("agreement is not a conflict", () => {
    // Two people typing the same correction is agreement. Naming it a
    // conflict would teach the owner to ignore the line that names them.
    const plan = planConflicts([{ path: "A.md", ours: "same", theirs: "same" }], none);
    assert.deepEqual(plan.writes, []);
    assert.deepEqual(plan.pairs, []);
  });

  it("keeps BOTH versions, and says which is which", () => {
    const plan = planConflicts(
      [{ path: "Ideas/Astrolabe.md", ours: "the phone's paragraph", theirs: "the laptop's paragraph" }],
      none,
    );
    assert.deepEqual(plan.writes, [{ path: "Ideas/Astrolabe (phone).md", content: "the phone's paragraph" }]);
    assert.deepEqual(plan.pairs, [{ path: "Ideas/Astrolabe.md", phonePath: "Ideas/Astrolabe (phone).md" }]);
    // The remote's bytes are not in the plan at all: they are already under
    // the original name, untouched. Nothing here can lose them.
    assert.ok(!plan.writes.some((w) => w.content.includes("laptop")));
  });

  it("recovers the standing pairs from the tree, because a conflict is a FACT", () => {
    // A phone closed with two unresolved pairs and reopened saying "synced"
    // would be the same lie as saying it while commits wait. So the count is
    // read off the working tree at every open, never remembered.
    assert.deepEqual(
      standingConflicts([
        "Welcome.md",
        "Ideas/Astrolabe.md",
        "Ideas/Astrolabe (phone).md",
        "Ideas/Astrolabe (phone) 2.md",
      ]),
      [
        { path: "Ideas/Astrolabe.md", phonePath: "Ideas/Astrolabe (phone) 2.md" },
        { path: "Ideas/Astrolabe.md", phonePath: "Ideas/Astrolabe (phone).md" },
      ],
    );
  });

  it("a `(phone)` file whose partner is gone is a note, not a conflict", () => {
    // The owner resolved it by deleting the other one. What they kept is a
    // note with an odd name, and the line has nothing left to say.
    assert.deepEqual(standingConflicts(["Ideas/Astrolabe (phone).md", "Welcome.md"]), []);
  });

  it("names what it did, in a message a `git log` on the laptop explains", () => {
    const one = conflictCommitMessage([{ path: "A.md", phonePath: "A (phone).md" }]);
    assert.match(one, /A \(phone\)\.md/);
    assert.match(one, /A\.md/);
    const many = conflictCommitMessage([
      { path: "A.md", phonePath: "A (phone).md" },
      { path: "B.md", phonePath: "B (phone).md" },
    ]);
    assert.match(many, /2 notes/);
  });
});

describe("the sync line — what the one line says, and in what order", () => {
  const NOW = 1_700_000_000_000;
  const after = (state: SyncState, ...events: Parameters<typeof syncReduce>[1][]): SyncState =>
    events.reduce(syncReduce, state);

  it("says nothing has been sent before anything has", () => {
    assert.deepEqual(syncLine(initialSyncState, NOW), { key: "never" });
  });

  it("counts what is waiting, and NEVER says synced while something waits", () => {
    const state = after(initialSyncState, { kind: "push-done", atMs: NOW }, { kind: "committed" }, { kind: "committed" });
    // A pull-and-push finished thirty seconds ago and two commits have
    // happened since. "Synced just now" would be true and useless; the line
    // that matters is the one about the two.
    assert.deepEqual(syncLine(state, NOW + 30_000), { key: "toPush", count: 2 });
  });

  it("says synced, with how long ago, only when nothing is waiting", () => {
    const state = after(initialSyncState, { kind: "committed" }, { kind: "push-done", atMs: NOW });
    assert.deepEqual(syncLine(state, NOW + 1000), { key: "syncedJustNow" });
    assert.deepEqual(syncLine(state, NOW + 5 * 60_000), { key: "syncedAgo", minutes: 5 });
  });

  it("says offline rather than failed when the network is the reason", () => {
    const state = after(initialSyncState, { kind: "push-done", atMs: NOW }, { kind: "offline" });
    assert.deepEqual(syncLine(state, NOW), { key: "offline" });
  });

  it("offline with work waiting says how much work, not just offline", () => {
    const state = after(initialSyncState, { kind: "committed" }, { kind: "offline" });
    assert.deepEqual(syncLine(state, NOW), { key: "toPush", count: 1 });
  });

  it("a conflict is the loudest thing there is, and does not age out", () => {
    const state = after(
      initialSyncState,
      { kind: "pull-started" },
      { kind: "pull-done", conflicts: [{ path: "A.md", phonePath: "A (phone).md" }] },
      { kind: "push-done", atMs: NOW },
    );
    // Everything is pushed and the vault is level with the remote — and the
    // line still names the pair, because nobody has decided which sentence
    // survives.
    assert.equal(state.ahead, 0);
    assert.deepEqual(syncLine(state, NOW + 60 * 60_000), { key: "conflicts", count: 1 });
    const cleared = syncReduce(state, { kind: "conflicts-cleared" });
    assert.deepEqual(syncLine(cleared, NOW), { key: "syncedJustNow" });
  });

  it("a diverged pull leaves a commit to push", () => {
    const state = syncReduce(initialSyncState, {
      kind: "pull-done",
      conflicts: [{ path: "A.md", phonePath: "A (phone).md" }],
    });
    // The conflict commit is a commit like any other. If it never went out,
    // the laptop would never learn that the pair exists.
    assert.equal(state.ahead, 1);
  });

  it("does not announce the same pair twice", () => {
    const pair = { path: "A.md", phonePath: "A (phone).md" };
    const state = after(
      initialSyncState,
      { kind: "pull-done", conflicts: [pair] },
      { kind: "pull-done", conflicts: [pair] },
    );
    assert.equal(state.conflicts.length, 1);
  });

  it("work in flight beats work waiting", () => {
    const state = after(initialSyncState, { kind: "committed" }, { kind: "pull-started" });
    assert.deepEqual(syncLine(state, NOW), { key: "syncing" });
    assert.deepEqual(syncLine(syncReduce(state, { kind: "push-started" }), NOW), { key: "pushing" });
  });

  it("a failure is a sentence, and the next success clears it", () => {
    const failed = syncReduce(initialSyncState, { kind: "failed", message: "403" });
    assert.deepEqual(syncLine(failed, NOW), { key: "failed", message: "403" });
    const fixed = syncReduce(failed, { kind: "push-done", atMs: NOW });
    assert.deepEqual(syncLine(fixed, NOW), { key: "syncedJustNow" });
  });
});
