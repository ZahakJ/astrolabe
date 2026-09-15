import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// The drawer breakpoint lives in two places that cannot import each other:
// client/state.ts (matchMedia) and client/styles/app.css (@media). They
// drifted once in spirit — the stylesheet said "phone or no fine pointer",
// the store said "under 1000px" — and the shell would have opened the
// drawer for a sidebar the grid still held. One string, four blocks.
describe("the drawer breakpoint", () => {
  const state = readFileSync(new URL("../client/state.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../client/styles/app.css", import.meta.url), "utf8");
  const m = /export const DRAWER_QUERY = "([^"]+)";/.exec(state);
  it("is one string, mirrored by every drawer block in the stylesheet", () => {
    assert.ok(m, "DRAWER_QUERY not found");
    const q = m![1];
    assert.ok(q.includes("not (any-pointer: fine)"), "a device with a mouse must keep docked panes");
    assert.equal(css.split(`@media ${q} {`).length - 1, 4, "app.css should carry the drawer query in exactly four blocks");
    assert.equal(css.split("@media (max-width: 999px) {").length - 1, 0, "no bare 999px block may remain");
  });
});
