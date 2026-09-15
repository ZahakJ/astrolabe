// ORBITS — the surface a `~orbits` tab renders.
//
// One lazy chunk for the whole study system (scripts/check-bundle.mjs pins
// it): the shelf, the session, the statistics drawer and the New
// deck modal share this sheet and this boundary, because a reader
// who opened one of them is about to open the others. The tab's path says
// which page is up: `~orbits` is the shelf, `~orbits/` and
// a note path a session over that deck, with `#` and a heading
// after it for one section only (client/workspace.ts).

import { orbitsSessionOf } from "../workspace.ts";
import ShelfView from "./ShelfView.tsx";
import SessionView from "./SessionView.tsx";
import "../styles/orbits.css";

export default function OrbitsSurface({ tabPath }: { tabPath: string }) {
  const session = orbitsSessionOf(tabPath);
  return session === null ? <ShelfView /> : <SessionView path={session.path} section={session.section} />;
}
