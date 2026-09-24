// THE SPLITS ARE MOVES (3.29 sweep, part 2).
//
// Each large module that was cut into parts kept its name and its exports, so
// every importer reads exactly what it read before. One block per split, over
// the import graph (tests/helpers/importGraph.ts): every name an importer asks
// the facade for is still exported by it, no part exports a name its family
// does not use, and nothing outside the family reaches into a part.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { surfaceOf } from "./helpers/importGraph.ts";

function assertMove(facade: string, parts: string[], outside: string[] = []): void {
  const s = surfaceOf(facade, parts, outside);
  assert.deepEqual(s.missing, [], `${facade} no longer exports what its importers ask for`);
  assert.deepEqual(s.unused, [], `a part of ${facade} exports names its family never takes`);
  assert.deepEqual(s.strays, [], `a file outside ${facade}'s family imports one of its parts`);
}

describe("server/indexer.ts, split into server/indexer/*", () => {
  it("keeps the store and every public signature; the parts are reached only through it", () => {
    assertMove("server/indexer.ts", [
      "server/indexer/language.ts",
      "server/indexer/resolve.ts",
      "server/indexer/folders.ts",
      "server/indexer/publish.ts",
      "server/indexer/posts.ts",
      "server/indexer/queries.ts",
    ]);
  });
});

describe("server/api.ts, its routes split into server/*Routes.ts", () => {
  it("mounts every route file; nothing else reaches one, and api.ts exports what it did", () => {
    assertMove("server/api.ts", [
      "server/requestBody.ts",
      "server/trashRoutes.ts",
      "server/tagRoutes.ts",
      "server/replaceRoutes.ts",
      "server/fileRoutes.ts",
      "server/commentRoutes.ts",
      "server/deckRoutes.ts",
      "server/settingsRoutes.ts",
      "server/syncRoutes.ts",
      "server/versionRoutes.ts",
      "server/eventRoutes.ts",
      "server/renameRoutes.ts",
    ]);
  });
});
