// The SSE event stream. Mounted from server/api.ts below the auth guard;
// moved out of that file unchanged.

import { Hono } from "hono";
import { isNoteVisibleToVisitor, visibleNotesUnder, whenIndexed, type FilterLang } from "./indexer.ts";
import type { VaultEvent } from "../shared/types.ts";
import { isNotePath } from "../shared/noteFormat.ts";
import { isPublishLimited } from "./auth.ts";
import { languageScope } from "./language.ts";
import { onEventCoalesced } from "./vault.ts";
import { streamSSE } from "hono/streaming";

export const eventRoutes = new Hono();

// ---------------------------------------------------------------- SSE events

/** Map a vault event to the events a publish-limited visitor may see: only events
 *  about notes that visitor can actually discover — published AND not curated
 *  away by the languageFilter. Undiscoverable paths are stripped from renames;
 *  a transition either way (publish/unpublish, and equally a note that becomes
 *  or stops being Arabic under the filter) becomes created/deleted so the
 *  curated collection stays honest. Captures pre-event state synchronously,
 *  then awaits the indexer before reading post-event state.
 *
 *  The languageFilter half is not cosmetic: gating on publication alone made
 *  this the one surface that leaked what CONTRACTS says the filter must never
 *  leak — an anonymous stream received the full vault path of a hidden note
 *  the moment it was created, edited or deleted, unprompted. */
async function visitorEvents(event: VaultEvent, lang: FilterLang): Promise<VaultEvent[]> {
  // A bulk frame names no note, so there is nothing in it to filter and
  // nothing in it to leak — and a visitor's post list is exactly as stale
  // after a storm as an admin's tree is. It goes through untouched.
  if (event.kind === "bulk") return [event];
  if (event.dir) {
    // Visitors have no folder structure, so the dir event itself is nothing
    // to them — but the notes a folder DELETE takes away are: with the event
    // dropped outright, a visitor's sidebar kept live links to notes the site
    // now 404s (client/App.tsx only reloads the tree on an event). Fan it out
    // into one "deleted" per note that was visible, sampled synchronously —
    // vault.deleteFolder emits this before the chained reindex removes the
    // records, the same before/after discipline the note branch relies on.
    // Hidden and unpublished notes are never named, so nothing leaks.
    // A folder MOVE is the same problem wearing the other verb: the notes did
    // not go away, they changed address, and a visitor holding the old one gets
    // a 404 from a link the site drew itself. Fan it out the same way, into a
    // per-note `renamed` — a published note that is hidden at its new address
    // (the languageFilter is path-blind, but publication can be re-read) leaves
    // as a `deleted`, so the curated collection stays honest either way.
    if (event.kind === "renamed" && event.toPath) {
      const dirTo = event.toPath;
      const before = visibleNotesUnder(event.path, lang);
      await whenIndexed();
      return before.map((notePath) => {
        const next = `${dirTo}${notePath.slice(event.path.length)}`;
        return isNoteVisibleToVisitor(next, lang)
          ? { kind: "renamed", path: notePath, toPath: next }
          : { kind: "deleted", path: notePath };
      });
    }
    //
    // A folder RESTORED out of `.trash/` is the same fan-out run backwards,
    // and it has to exist for the same reason: dropping the created event
    // left a visitor's sidebar missing published notes that the site was
    // already serving, until something else happened to make it reload. The
    // sample is taken AFTER the index catches up here — the notes do not
    // exist to the indexer before the restore, which is the mirror image of
    // the delete's sample-first discipline.
    if (event.kind === "created") {
      await whenIndexed();
      return visibleNotesUnder(event.path, lang).map((notePath) => ({
        kind: "created" as const,
        path: notePath,
      }));
    }
    if (event.kind !== "deleted") return [];
    const gone = visibleNotesUnder(event.path, lang);
    await whenIndexed();
    return gone.map((notePath) => ({ kind: "deleted", path: notePath }));
  }
  if (!isNotePath(event.path)) return []; // attachments: never
  const wasVisible = isNoteVisibleToVisitor(event.path, lang);
  await whenIndexed();
  switch (event.kind) {
    case "created":
    case "changed": {
      const nowVisible = isNoteVisibleToVisitor(event.path, lang);
      if (wasVisible && !nowVisible) return [{ kind: "deleted", path: event.path }];
      if (!wasVisible && nowVisible) return [{ kind: "created", path: event.path }];
      return nowVisible ? [{ kind: event.kind, path: event.path }] : [];
    }
    case "deleted":
      return wasVisible ? [{ kind: "deleted", path: event.path }] : [];
    case "renamed": {
      const nowVisible = event.toPath ? isNoteVisibleToVisitor(event.toPath, lang) : false;
      if (wasVisible && nowVisible) return [event];
      if (wasVisible) return [{ kind: "deleted", path: event.path }];
      if (nowVisible && event.toPath) return [{ kind: "created", path: event.toPath }];
      return [];
    }
  }
}

eventRoutes.get("/events", (c) => {
  const limited = isPublishLimited(c);
  // Resolved ONCE, at subscribe time, and held for the life of the stream:
  // EventSource cannot set headers, so this connection's reader language came
  // in as `?lang=` (the same carve-out `?preview=visitor` gets) and cannot
  // change without a reconnect — which is exactly what the client does when a
  // visitor flips the EN/ع switch. A stream that kept re-reading the mode
  // would start announcing notes outside the collection this subscriber was
  // given, which is the leak the filter exists to prevent.
  const lang = languageScope(c, limited).lang;
  return streamSSE(c, async (stream) => {
    let live = true;
    // COALESCED, not raw: a `git pull` is one "bulk" frame here instead of a
    // thousand named ones (server/vault.ts). The index still gets every event
    // — it subscribes with plain onEvent — because it needs the paths; this
    // subscriber answers an event by refetching, so one instruction to refetch
    // everything is strictly more than the thousand it replaces.
    const unsubscribe = onEventCoalesced((event) => {
      if (!live) return;
      const deliver = async (): Promise<void> => {
        const visible = limited ? await visitorEvents(event, lang) : [event];
        for (const out of visible) {
          if (!live) return;
          await stream.writeSSE({ event: "message", data: JSON.stringify(out) });
        }
      };
      deliver().catch((err: unknown) => {
        // A WRITE THAT FAILED MEANS THIS CLIENT IS NO LONGER RECEIVING — and
        // swallowing it (which is what `.catch(() => {})` did) left the socket
        // open, the 15 s pings still going out, and the client convinced it
        // was subscribed while every vault event went into the floor. Silent,
        // permanent, and indistinguishable from a quiet vault.
        //
        // So the stream ENDS. EventSource reconnects on its own, and the
        // client treats a reconnect as a gap it has to re-read (client/api.ts
        // ::subscribeEvents onReconnect → revalidateBuffers), which is exactly
        // the recovery this failure needs.
        if (!live) return;
        live = false;
        console.error("events: dropping a stream whose delivery failed:", err);
        unsubscribe();
        void stream.close();
      });
    });
    stream.onAbort(() => {
      live = false;
      unsubscribe();
    });
    while (live && !stream.closed) {
      await stream.sleep(15_000);
      try {
        await stream.writeSSE({ event: "ping", data: "" });
      } catch {
        break;
      }
    }
    unsubscribe();
  });
});
