/**
 * THE CONFLICT CONTRACT: THE PHONE NEVER MERGES PROSE.
 *
 * A vault with two writers — this phone and the laptop that pushes to the same
 * repository — will eventually change one note in both places. Every other
 * answer to that is worse than this one:
 *
 *   - A three-way merge inside somebody's paragraph, decided by a phone, is
 *     the failure the shell's architecture note refused on the owner's behalf
 *     (mobile/README.md). It is still refused.
 *   - "Theirs wins" and "mine wins" both lose writing that was never shown to
 *     anyone.
 *
 * So: the remote file stays where it is, under its own name, and the phone's
 * version is set down BESIDE it as `<Note> (phone).md`. Both are committed.
 * The pair is named in the shell's sync line, which opens them. Nothing is
 * merged, nothing is discarded, and the person who wrote both sentences is the
 * one who decides which survives.
 *
 * Pure on purpose — this is the rule, and a rule is worth a test
 * (tests/pocketConflict.test.ts).
 */

/** One note that changed on both sides of a pull. */
export interface ConflictPair {
  /** The path as the remote has it — untouched, still the note. */
  path: string;
  /** Where this phone's version was set down. */
  phonePath: string;
}

const MARK = " (phone)";

/** `Notes/Idea.md` → `Notes/Idea (phone).md`, and `Idea (phone) 2.md` after
 *  that, so a second unresolved conflict never overwrites the first. `taken`
 *  answers "is this path already in the working tree"; the caller passes the
 *  set it just walked. */
export function phonePathFor(path: string, taken: (candidate: string) => boolean): string {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash + 1);
  const name = slash === -1 ? path : path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  // A leading dot is a name, not an extension (".gitignore"), which is why
  // `dot > 0` rather than `dot !== -1`.
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";

  const first = `${dir}${stem}${MARK}${ext}`;
  if (!taken(first)) return first;
  for (let n = 2; n < 1000; n++) {
    const next = `${dir}${stem}${MARK} ${n}${ext}`;
    if (!taken(next)) return next;
  }
  // A thousand unresolved conflicts on one note is not a case to design for;
  // it is one to refuse to silently paper over.
  throw new Error(`No free name beside ${path}`);
}

/**
 * The whole rule, as one pure step.
 *
 * `ours` is what this phone holds for each diverged path, `theirs` is what the
 * pull brought. A path whose two sides are byte-identical is not a conflict —
 * two people typing the same correction is agreement, and naming it a conflict
 * would teach the owner to ignore the line.
 *
 * The answer is a list of writes to perform and the pairs to announce. The
 * caller does the writing; this decides what.
 */
export interface ConflictPlan {
  /** Files to write: the phone's bytes, under the `(phone)` name. */
  writes: { path: string; content: string }[];
  /** Paths whose remote version is now the one under the original name. */
  pairs: ConflictPair[];
}

export function planConflicts(
  diverged: { path: string; ours: string; theirs: string }[],
  taken: (candidate: string) => boolean,
): ConflictPlan {
  const plan: ConflictPlan = { writes: [], pairs: [] };
  const claimed = new Set<string>();
  const isTaken = (candidate: string): boolean => claimed.has(candidate) || taken(candidate);
  for (const one of diverged) {
    if (one.ours === one.theirs) continue;
    const phonePath = phonePathFor(one.path, isTaken);
    claimed.add(phonePath);
    plan.writes.push({ path: phonePath, content: one.ours });
    plan.pairs.push({ path: one.path, phonePath });
  }
  return plan;
}

/**
 * THE PAIRS STILL STANDING, read off the working tree.
 *
 * A conflict is a fact about the vault, not about a session: the two files are
 * on disk under two names until somebody decides. So the sync line's count is
 * recovered from the tree at every open rather than remembered — a phone that
 * was closed with two unresolved pairs and reopened saying "synced" would be
 * the same lie as saying it while commits wait.
 *
 * A `(phone)` file whose partner is gone is not a pair any more: the owner
 * resolved it by deleting the other one, and the file they kept is just a
 * note with an odd name.
 */
export function standingConflicts(paths: Iterable<string>): ConflictPair[] {
  const held = new Set(paths);
  const out: ConflictPair[] = [];
  for (const phonePath of held) {
    const match = /^(.*)\(phone\)(?: \d+)?(\.[^./]*)?$/.exec(phonePath);
    if (!match) continue;
    const path = `${(match[1] ?? "").replace(/ $/, "")}${match[2] ?? ""}`;
    if (path !== phonePath && held.has(path)) out.push({ path, phonePath });
  }
  return out.sort((a, b) => a.phonePath.localeCompare(b.phonePath));
}

/** The commit message for the commit that sets the pairs down. Named so the
 *  owner reading `git log` on the laptop sees what the phone did and why. */
export function conflictCommitMessage(pairs: ConflictPair[]): string {
  if (pairs.length === 1) return `Astrolabe pocket: kept ${pairs[0]?.phonePath} beside ${pairs[0]?.path}`;
  return `Astrolabe pocket: kept ${pairs.length} notes beside their remote versions`;
}
