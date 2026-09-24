// What a moderation row adds for an entry another site sent
// (docs/webmentions.md): where it came from (the channel and the gesture, as
// chips), the page or account it came from (a link), and for a webmention a
// "Verify again" that fetches the source now — kept, refreshed, or withdrawn
// when the source no longer links here. Used by ModerationPanel, which the
// phone shell mounts too, so both shells show the same kinds.

import { useState } from "react";
import type { CommentData } from "../../shared/types.ts";
import { t } from "../i18n.ts";
import { toast } from "../toast.ts";
import { safeHref, shortUrl, verifyMention } from "./mentionsApi.ts";
import "./mentions.css";

const TYPE_KEYS = {
  like: "mentionTypeLike",
  repost: "mentionTypeRepost",
  reply: "mentionTypeReply",
  mention: "mentionTypeMention",
} as const;

/** The chips and the source, in the row's meta line. Nothing for a
 *  visitor's own comment. */
export function InteractionMeta({ cm }: { cm: CommentData }) {
  if (!cm.kind || cm.kind === "comment") return null;
  const source = safeHref(cm.source);
  return (
    <>
      <span className="s-comment__chip">{t(cm.kind === "webmention" ? "mentionKindWebmention" : "mentionKindFediverse")}</span>
      {cm.type && <span className="s-comment__chip">{t(TYPE_KEYS[cm.type])}</span>}
      {source && (
        <a className="s-mentions__source" href={source} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" title={source}>
          {shortUrl(source)}
        </a>
      )}
    </>
  );
}

/** "Verify again", for a webmention. `onGone` is told when the source no
 *  longer links here and the mention was withdrawn. */
export function VerifyAgain({ cm, onGone, onUpdated }: { cm: CommentData; onGone: () => void; onUpdated: () => void }) {
  const [busy, setBusy] = useState(false);
  if (cm.kind !== "webmention") return null;
  return (
    <button
      type="button"
      className="s-btn s-mentions__verify"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        verifyMention(cm.id)
          .then((outcome) => {
            if (outcome === "withdrawn" || outcome === "dropped") {
              toast(t("mentionWithdrawnToast"));
              onGone();
            } else if (outcome === "unreachable") {
              toast(t("mentionUnreachableToast"), "error");
            } else {
              toast(t("mentionVerifiedToast"));
              onUpdated();
            }
          })
          .catch(() => toast(t("mentionVerifyFailed"), "error"))
          .finally(() => setBusy(false));
      }}
    >
      {t(busy ? "mentionVerifying" : "mentionVerifyAgain")}
    </button>
  );
}
