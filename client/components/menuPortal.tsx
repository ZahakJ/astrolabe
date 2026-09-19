// ContextMenu.tsx, opened from code that is not a React component.
//
// The tab bar and the tree open the one context menu by RENDERING it — they
// are components, they hold the anchor in state, and `{menu && <ContextMenu
// …/>}` is the whole story. The editor's table widget cannot: its DOM is
// built imperatively inside a CodeMirror widget that outlives any render, and
// it is the third surface to want the same box.
//
// The alternative is what sectionMenu.ts had to do before this existed —
// hand-build `.s-menu` and re-derive the placement, the Escape capture, the
// focus restore and the dismissal rules. ContextMenu.tsx's own header says
// two menus that look alike and behave differently is a bug, not a
// duplication. So this is a door, not a second menu: one throwaway React root
// on <body>, the real component inside it, and the component keeps every rule
// it already owns.
//
// One at a time, deliberately: a second call closes the first, which is what
// `contextmenu` elsewhere means and what the component would do anyway.

import { createRoot, type Root } from "react-dom/client";
import { ContextMenu, type MenuAnchor, type MenuRow } from "./ContextMenu.tsx";

let root: Root | null = null;
let host: HTMLElement | null = null;

/** Close whatever menu this door opened. Safe to call when none is up. */
export function closeMenuPortal(): void {
  const dying = root;
  const dyingHost = host;
  root = null;
  host = null;
  if (!dying) return;
  // A MICROTASK, because every caller is inside a React event handler or a
  // DOM listener the component itself installed: unmounting a root from
  // inside its own render cycle is the "synchronously unmount" warning, and
  // the node would go before the click that asked for it had finished.
  queueMicrotask(() => {
    dying.unmount();
    dyingHost?.remove();
  });
}

/** Open the menu at a viewport point. `at.fromKeyboard` puts focus inside it
 *  and hands focus back on every close path — the component's rule, passed
 *  straight through. */
export function openMenuPortal(opts: {
  at: MenuAnchor;
  rows: MenuRow[];
  label: string;
  onClose?: () => void;
}): void {
  closeMenuPortal();
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  host = mount;
  const mounted = createRoot(mount);
  root = mounted;
  const close = (): void => {
    if (root === mounted) closeMenuPortal();
    opts.onClose?.();
  };
  mounted.render(
    <ContextMenu at={opts.at} rows={opts.rows} label={opts.label} onClose={close} />,
  );
}
