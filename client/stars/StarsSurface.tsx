// CONSTELLATIONS — the surface a `~constellations` tab renders.
//
// One lazy chunk for the whole study system (scripts/check-bundle.mjs pins
// it): the shelf, the session, the statistics drawer and the New
// constellation modal share this sheet and this boundary, because a reader
// who opened one of them is about to open the others. The tab's path says
// which page is up: `~constellations` is the shelf, `~constellations/` and
// a note path a session over that constellation, with `#` and a heading
// after it for one section only (client/workspace.ts).

import { starsSessionOf } from "../workspace.ts";
import ShelfView from "./ShelfView.tsx";
import SessionView from "./SessionView.tsx";
import "../styles/stars.css";

export default function StarsSurface({ tabPath }: { tabPath: string }) {
  const session = starsSessionOf(tabPath);
  return session === null ? <ShelfView /> : <SessionView path={session.path} section={session.section} />;
}
