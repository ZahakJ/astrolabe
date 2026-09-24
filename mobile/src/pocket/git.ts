/**
 * THE REPOSITORY, ON THE PHONE.
 *
 * `isomorphic-git` over the app's private filesystem, with the network half
 * performed natively (pocket/transport.ts). Four operations and one rule.
 *
 * THE RULE: the phone never merges prose. `pull()` fast-forwards when it can
 * and, when it cannot, sets this phone's version of each diverged note down
 * beside the remote one as `<Note> (phone).md` and commits both
 * (pocket/conflict.ts). There is no three-way merge, no "theirs wins", no
 * silent loss — the two sentences are both on disk under two names and the
 * person who wrote them decides.
 *
 * WHY A RECORDED BASE COMMIT RATHER THAN A MERGE BASE. The clone is shallow
 * (`depth: 1`): a two-thousand-note vault with five years of history is a
 * minute of network the owner did not ask for, and none of it is read until
 * they open a note's past. A shallow repository has no common ancestor to
 * compute, so this records the remote commit it was last level with
 * (`baseSha`) and diffs against that. It is exact, it costs one string, and it
 * survives an app restart.
 */

// `Buffer` first: isomorphic-git throws without one the moment a clone starts.
import "./bufferShim.ts";
import * as git from "isomorphic-git";
import type { NoteRevision } from "../../../shared/types.ts";
import { planConflicts, conflictCommitMessage, type ConflictPair } from "./conflict.ts";
import type { PocketFs } from "./fs.ts";
import type { GitHttpClient } from "./transport.ts";

export interface PocketRepoOptions {
  fs: PocketFs;
  http: GitHttpClient;
  /** Where the working tree lives inside the app's private storage. */
  dir: string;
  url: string;
  branch: string;
  /** `Authorization` for every git request; the token never enters .git/config. */
  headers: Record<string, string>;
  author: { name: string; email: string };
  /** Remembers the remote commit this clone was last level with. */
  base: {
    read(): Promise<string | null>;
    write(sha: string): Promise<void>;
  };
}

export interface PullResult {
  kind: "unchanged" | "fast-forward" | "diverged";
  /** Files whose bytes changed in the working tree, for the index to re-read. */
  changed: string[];
  removed: string[];
  conflicts: ConflictPair[];
  remoteSha: string;
}

/** The shape isomorphic-git wants for `fs`; ours already is one. */
type GitFs = Parameters<typeof git.clone>[0]["fs"];

export class PocketRepo {
  // Spelled out rather than a constructor parameter property: this file is
  // loaded by `node --test` through the harness, and Node's type stripping is
  // strip-only — a parameter property is syntax it refuses rather than erases.
  private readonly options: PocketRepoOptions;

  constructor(options: PocketRepoOptions) {
    this.options = options;
  }

  private get common(): { fs: GitFs; dir: string } {
    return { fs: this.options.fs as GitFs, dir: this.options.dir };
  }

  /** ONE SHALLOW BRANCH. `singleBranch` keeps the other branches' objects off
   *  the phone entirely; `depth: 1` keeps the history off it until something
   *  asks. */
  async clone(onProgress?: (phase: string, loaded: number, total: number) => void): Promise<string> {
    await git.clone({
      ...this.common,
      http: this.options.http,
      url: this.options.url,
      ref: this.options.branch,
      headers: this.options.headers,
      singleBranch: true,
      depth: 1,
      onProgress: onProgress
        ? (event) => onProgress(event.phase, event.loaded ?? 0, event.total ?? 0)
        : undefined,
    });
    // `.trash/` is this device's undo drawer and belongs to nobody else: a
    // delete on the phone must reach the laptop as a delete, with the copy
    // that can undo it staying here. `.git/info/exclude` is the right place —
    // it is the repository's own ignore list and is never committed, so the
    // vault's `.gitignore` stays the owner's file.
    await this.excludeLocalPaths();
    const head = await git.resolveRef({ ...this.common, ref: "HEAD" });
    await this.options.base.write(head);
    return head;
  }

  private async excludeLocalPaths(): Promise<void> {
    const path = `${this.options.dir}/.git/info/exclude`;
    const line = "\n# Astrolabe pocket: this phone's undo drawer, never pushed.\n.trash/\n";
    let held = "";
    try {
      const data = await this.options.fs.promises.readFile(path, { encoding: "utf8" });
      held = typeof data === "string" ? data : new TextDecoder().decode(data);
    } catch {
      // A fresh clone has an info/ directory but not always the file.
    }
    if (held.includes(".trash/")) return;
    try {
      await this.options.fs.promises.mkdir(`${this.options.dir}/.git/info`);
    } catch {
      // Already there, which is the ordinary case.
    }
    await this.options.fs.promises.writeFile(path, held + line, { encoding: "utf8" });
  }

  async head(): Promise<string> {
    return git.resolveRef({ ...this.common, ref: "HEAD" });
  }

  /** Commits on this phone the remote has not got. */
  async ahead(): Promise<number> {
    const base = await this.options.base.read();
    const head = await this.head();
    if (!base || base === head) return 0;
    try {
      const log = await git.log({ ...this.common, ref: head, depth: 200 });
      const at = log.findIndex((entry) => entry.oid === base);
      return at === -1 ? log.length : at;
    } catch {
      return 1;
    }
  }

  async commit(message: string, paths: string[]): Promise<string | null> {
    let staged = 0;
    let tracked: Set<string> | undefined;
    for (const path of new Set(paths)) {
      if (path.startsWith(".trash/")) continue;
      try {
        await git.add({ ...this.common, filepath: path });
        staged++;
      } catch {
        // The file is gone — a delete or a rename's old half. `remove` stages
        // exactly that, and a path that was never tracked simply has nothing
        // to stage, which is not a failure either. isomorphic-git's `remove`
        // does not throw for an untracked path, so tracking is asked first:
        // counting it staged made an EMPTY commit (tests/pocketGit.test.ts).
        tracked ??= new Set(await git.listFiles({ ...this.common }));
        if (!tracked.has(path)) continue;
        await git.remove({ ...this.common, filepath: path });
        staged++;
      }
    }
    if (staged === 0) return null;
    return git.commit({
      ...this.common,
      message,
      author: { name: this.options.author.name, email: this.options.author.email },
    });
  }

  /**
   * Bring the remote's work down.
   *
   * Three outcomes, in the order they are tested: the remote has not moved;
   * the remote has moved and this phone has not (a fast-forward, the ordinary
   * case); both have moved, which is the case the conflict contract is for.
   */
  async pull(): Promise<PullResult> {
    await git.fetch({
      ...this.common,
      http: this.options.http,
      url: this.options.url,
      ref: this.options.branch,
      headers: this.options.headers,
      singleBranch: true,
      depth: 1,
      remote: "origin",
    });
    const remoteSha = await git.resolveRef({
      ...this.common,
      ref: `refs/remotes/origin/${this.options.branch}`,
    });
    const base = (await this.options.base.read()) ?? (await this.head());
    const head = await this.head();

    if (remoteSha === base) return { kind: "unchanged", changed: [], removed: [], conflicts: [], remoteSha };

    if (head === base) {
      const before = await this.treeFiles(base);
      await this.moveTo(remoteSha);
      const after = await this.treeFiles(remoteSha);
      await this.options.base.write(remoteSha);
      return {
        kind: "fast-forward",
        changed: [...after].filter(([path, oid]) => before.get(path) !== oid).map(([path]) => path),
        removed: [...before.keys()].filter((path) => !after.has(path)),
        conflicts: [],
        remoteSha,
      };
    }

    return this.diverged(base, remoteSha);
  }

  /**
   * BOTH SIDES MOVED. The remote's version of every note keeps its name; this
   * phone's version of a note the remote also changed is set down beside it.
   * A note only THIS phone touched is simply kept — it is not a conflict, and
   * naming it one would teach the owner to ignore the line.
   */
  private async diverged(base: string, remoteSha: string): Promise<PullResult> {
    const baseTree = await this.treeFiles(base);
    const remoteTree = await this.treeFiles(remoteSha);
    const ours = new Map<string, string>();
    const oursDeleted: string[] = [];

    for (const path of new Set([...baseTree.keys(), ...(await this.workingFiles())])) {
      if (path.startsWith(".trash/")) continue;
      const text = await this.readWorking(path);
      if (text === null) {
        if (baseTree.has(path)) oursDeleted.push(path);
        continue;
      }
      const baseText = baseTree.has(path) ? await this.readBlob(base, path) : null;
      if (text !== baseText) ours.set(path, text);
    }

    await this.moveTo(remoteSha);

    const taken = new Set(remoteTree.keys());
    const diverged: { path: string; ours: string; theirs: string }[] = [];
    const plainWrites: { path: string; content: string }[] = [];
    for (const [path, text] of ours) {
      const theirs = remoteTree.has(path) ? await this.readBlob(remoteSha, path) : null;
      const baseText = baseTree.has(path) ? await this.readBlob(base, path) : null;
      if (theirs === null || theirs === baseText) plainWrites.push({ path, content: text });
      else diverged.push({ path, ours: text, theirs });
    }
    const plan = planConflicts(diverged, (candidate) => taken.has(candidate));

    for (const write of [...plainWrites, ...plan.writes]) await this.writeWorking(write.path, write.content);
    for (const path of oursDeleted) {
      // A note deleted here that the remote did not touch stays deleted; one
      // the remote CHANGED comes back, because a delete is a weaker statement
      // than an edit and the edit is the thing that would be lost.
      if (remoteTree.get(path) === baseTree.get(path)) await this.removeWorking(path);
    }

    const touched = [...plainWrites.map((w) => w.path), ...plan.writes.map((w) => w.path), ...oursDeleted];
    await this.commit(
      plan.pairs.length > 0 ? conflictCommitMessage(plan.pairs) : "Astrolabe pocket: this phone's changes, replayed",
      touched,
    );
    await this.options.base.write(remoteSha);

    return {
      kind: "diverged",
      changed: [...new Set([...remoteTree.keys(), ...touched])],
      removed: oursDeleted.filter((path) => !remoteTree.has(path)),
      conflicts: plan.pairs,
      remoteSha,
    };
  }

  /** Send this phone's commits. The answer is whether anything moved. */
  async push(): Promise<boolean> {
    const before = await this.head();
    const result = await git.push({
      ...this.common,
      http: this.options.http,
      url: this.options.url,
      ref: this.options.branch,
      remoteRef: this.options.branch,
      headers: this.options.headers,
    });
    if (result.ok === false || (result.error !== undefined && result.error !== null)) {
      throw new Error(String(result.error ?? "The remote refused the push"));
    }
    await this.options.base.write(before);
    return true;
  }

  // ── history ───────────────────────────────────────────────────────────────

  /**
   * One note's past, from the commits this phone holds.
   *
   * A shallow clone begins at the moment of the clone, so this is "what has
   * happened since you put the vault in your pocket", not the whole history of
   * the file. That is stated in the manual rather than hidden: a phone
   * pretending to hold five years of history it never downloaded would be a
   * worse answer than a short list with a known beginning.
   */
  async history(filepath: string, limit: number): Promise<NoteRevision[]> {
    let log: Awaited<ReturnType<typeof git.log>>;
    try {
      log = await git.log({ ...this.common, filepath, depth: limit, follow: true });
    } catch {
      return [];
    }
    return log.map((entry) => ({
      sha: entry.oid,
      short: entry.oid.slice(0, 7),
      iso: new Date(entry.commit.author.timestamp * 1000).toISOString(),
      subject: entry.commit.message.split("\n")[0] ?? "",
      path: filepath,
      added: null,
      removed: null,
    }));
  }

  async blobAt(filepath: string, sha: string): Promise<string | null> {
    return this.readBlob(sha, filepath);
  }

  // ── the small pieces ──────────────────────────────────────────────────────

  /** Every tracked path at one commit, with its blob id — the diff key. */
  private async treeFiles(oid: string): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    await git.walk({
      ...this.common,
      trees: [git.TREE({ ref: oid })],
      map: async (filepath, entries) => {
        const entry = entries?.[0];
        if (!entry || filepath === ".") return;
        if ((await entry.type()) !== "blob") return;
        out.set(filepath, (await entry.oid()) ?? "");
      },
    });
    return out;
  }

  private async readBlob(oid: string, filepath: string): Promise<string | null> {
    try {
      const blob = await git.readBlob({ ...this.common, oid, filepath });
      return new TextDecoder().decode(blob.blob);
    } catch {
      return null;
    }
  }

  private async moveTo(oid: string): Promise<void> {
    await git.writeRef({ ...this.common, ref: `refs/heads/${this.options.branch}`, value: oid, force: true });
    await git.checkout({ ...this.common, ref: this.options.branch, force: true });
  }

  private async workingFiles(): Promise<string[]> {
    const out: string[] = [];
    const walkDir = async (rel: string): Promise<void> => {
      const names = await this.options.fs.promises.readdir(rel ? `${this.options.dir}/${rel}` : this.options.dir);
      for (const name of names) {
        if (name === ".git") continue;
        const child = rel ? `${rel}/${name}` : name;
        const stat = await this.options.fs.promises.lstat(`${this.options.dir}/${child}`);
        if (stat.isDirectory()) await walkDir(child);
        else if (stat.isFile()) out.push(child);
      }
    };
    await walkDir("");
    return out;
  }

  private async readWorking(path: string): Promise<string | null> {
    try {
      const data = await this.options.fs.promises.readFile(`${this.options.dir}/${path}`, { encoding: "utf8" });
      return typeof data === "string" ? data : new TextDecoder().decode(data);
    } catch {
      return null;
    }
  }

  private async writeWorking(path: string, content: string): Promise<void> {
    const parts = path.split("/").slice(0, -1);
    let at = this.options.dir;
    for (const part of parts) {
      at += `/${part}`;
      try {
        await this.options.fs.promises.mkdir(at);
      } catch {
        // Already there.
      }
    }
    await this.options.fs.promises.writeFile(`${this.options.dir}/${path}`, content, { encoding: "utf8" });
  }

  private async removeWorking(path: string): Promise<void> {
    try {
      await this.options.fs.promises.unlink(`${this.options.dir}/${path}`);
    } catch {
      // Already gone.
    }
  }
}
