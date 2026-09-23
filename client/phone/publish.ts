// PUBLISHING ASKS FIRST, on a phone.
//
// The desktop's status bar publishes on a single click, and on a phone that
// click was a 79×44 pill beside the mode pill: the audit's harness published a
// note by accident and the toast read "Your first note is live — the site is
// public now". A thumb is not a pointer, and publishing is the one verb in the
// shell that reaches strangers, so it is the one that confirms — from the
// note sheet's Actions and from a tree row's long press alike.

import { noteLabelOf } from "../../shared/noteFormat.ts";
import { confirmModal } from "../components/Confirm.tsx";
import { t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";

export async function publishWithConfirmation(path: string, publish: boolean): Promise<void> {
  const name = noteLabelOf(path.slice(path.lastIndexOf("/") + 1));
  const ok = await confirmModal({
    title: tf(publish ? "phPublishAsk" : "phUnpublishAsk", { name }),
    body: t(publish ? "phPublishBody" : "phUnpublishBody"),
    confirmLabel: t(publish ? "publish" : "phUnpublish"),
    accent: publish,
  });
  if (ok) await useStore.getState().togglePublish(path, publish);
}
