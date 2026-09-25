// Read aloud's line (server/speakQueue.ts): one synthesis at a time, FIFO;
// the same key asked twice is one job; a job every asker walked away from is
// dropped before it runs; a running job finishes whoever left.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSpeakQueue } from "../server/speakQueue.ts";

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("createSpeakQueue", () => {
  it("runs one job at a time, in the order asked", async () => {
    const q = createSpeakQueue<string>();
    const order: string[] = [];
    let running = 0;
    let peak = 0;
    const job = (name: string) => async () => {
      running++;
      peak = Math.max(peak, running);
      order.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end ${name}`);
      running--;
      return name;
    };
    const results = await Promise.all([q.submit("a", job("a")), q.submit("b", job("b")), q.submit("c", job("c"))]);
    assert.deepEqual(results, ["a", "b", "c"]);
    assert.equal(peak, 1);
    assert.deepEqual(order, ["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("the same key twice is one job with one answer", async () => {
    const q = createSpeakQueue<number>();
    let runs = 0;
    const gate = deferred<void>();
    const run = async (): Promise<number> => {
      runs++;
      await gate.promise;
      return 42;
    };
    const one = q.submit("k", run);
    const two = q.submit("k", run);
    gate.resolve();
    assert.deepEqual(await Promise.all([one, two]), [42, 42]);
    assert.equal(runs, 1);
  });

  it("counts what waits behind the running job", async () => {
    const q = createSpeakQueue<string>();
    const gate = deferred<void>();
    const first = q.submit("a", async () => {
      await gate.promise;
      return "a";
    });
    const second = q.submit("b", async () => "b");
    assert.equal(q.busy(), true);
    assert.equal(q.waiting(), 1);
    gate.resolve();
    await Promise.all([first, second]);
    assert.equal(q.busy(), false);
    assert.equal(q.waiting(), 0);
  });

  it("drops a queued job whose every asker aborted, and says so to them", async () => {
    const q = createSpeakQueue<string>();
    const gate = deferred<void>();
    const ran: string[] = [];
    const first = q.submit("a", async () => {
      await gate.promise;
      ran.push("a");
      return "a";
    });
    const ctl = new AbortController();
    const abandoned = q.submit("b", async () => {
      ran.push("b");
      return "b";
    }, ctl.signal);
    ctl.abort();
    await assert.rejects(abandoned, { name: "AbortError" });
    gate.resolve();
    await first;
    await q.submit("c", async () => "c");
    assert.deepEqual(ran, ["a"], "b never ran");
  });

  it("keeps a job that still has one asker when another aborts", async () => {
    const q = createSpeakQueue<string>();
    const gate = deferred<void>();
    const first = q.submit("a", async () => {
      await gate.promise;
      return "a";
    });
    const ctl = new AbortController();
    const leaver = q.submit("b", async () => "b", ctl.signal);
    const stayer = q.submit("b", async () => "b");
    ctl.abort();
    await assert.rejects(leaver, { name: "AbortError" });
    gate.resolve();
    await first;
    assert.equal(await stayer, "b");
  });

  it("an already-aborted signal is refused at once", async () => {
    const q = createSpeakQueue<string>();
    const ctl = new AbortController();
    ctl.abort();
    await assert.rejects(q.submit("x", async () => "x", ctl.signal), { name: "AbortError" });
  });

  it("a failing job fails its askers and the line moves on", async () => {
    const q = createSpeakQueue<string>();
    const bad = q.submit("bad", async () => {
      throw Object.assign(new Error("engine died"), { code: "engine" });
    });
    const good = q.submit("good", async () => "ok");
    await assert.rejects(bad, /engine died/);
    assert.equal(await good, "ok");
  });
});
