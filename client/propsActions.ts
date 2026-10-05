// What a right-click on the properties card does, and the ways back
// (client/propsCard.ts holds the predicate and the listener, in first paint).
// Its own chunk: the settings write, the toasts and the menu's React portal
// are bytes only the owner who hides the card ever needs.

import * as api from "./api.ts";
import { openMenuPortal } from "./components/menuPortal.tsx";
import type { MenuAnchor } from "./components/ContextMenu.tsx";
import { t } from "./i18n.ts";
import { useStore } from "./state.ts";
import { toast } from "./toast.ts";
import { actionToast } from "./undoToast.ts";

/** Turn the card on or off from outside the settings panel. Optimistic,
 *  because the card has to leave on the click that asked for it; the server's
 *  answer settles it, and a refusal puts it back and says why. */
export async function setPropsCard(on: boolean): Promise<boolean> {
  const store = useStore.getState();
  if (!store.admin) return false;
  const previous = store.propsCard;
  useStore.setState({ propsCard: on });
  try {
    // null, not true: on is the default, and a default is not written down.
    const res = await api.patchSettings({ propsCard: on ? null : false });
    useStore.setState({ propsCard: res.effective.propsCard !== false });
    return true;
  } catch (err) {
    useStore.setState({ propsCard: previous });
    toast(err instanceof Error ? err.message : t("settingsSaveFailed"), "error");
    return false;
  }
}

/** The menu's verb. The toast says where the card comes back, because the
 *  thing that would have said so has just left the screen. */
export function hideProperties(): void {
  void setPropsCard(false).then((ok) => {
    if (ok) actionToast(t("propsHiddenToast"), t("undo"), () => void setPropsCard(true));
  });
}

/** The one ContextMenu, with its one row. */
export function openPropsMenu(at: MenuAnchor): void {
  openMenuPortal({
    at,
    label: t("properties"),
    rows: [{ label: t("hidePropertiesMenu"), onSelect: hideProperties }],
  });
}
