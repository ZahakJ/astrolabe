// NAMED LAYOUTS — the one restore. The picker (components/LayoutPicker.tsx)
// and the palette's "Load layout: <name>" rows both land here, so "restore
// a layout" means one thing: fetch the saved arrangement, parse it through
// the same validator the boot path uses (workspace.ts::parseWorkspace), and
// swap it in. Two copies of this would be two answers to a malformed file.

import { getLayout } from "./api.ts";
import { t, tf } from "./i18n.ts";
import { useStore } from "./state.ts";
import { toast } from "./toast.ts";
import { parseWorkspace } from "./workspace.ts";

/** Swap the workspace for the saved layout `name`. Resolves true when it
 *  landed; a missing or malformed layout toasts and resolves false. */
export async function restoreLayout(name: string): Promise<boolean> {
  try {
    const { workspace } = await getLayout(name);
    const ws = parseWorkspace(workspace);
    if (!ws) throw new Error("bad layout");
    useStore.getState().applyWorkspace(ws);
    toast(tf("layoutRestored", { name }));
    return true;
  } catch {
    toast(t("layoutFailed"), "error");
    return false;
  }
}
