// THE CLIPPER ROW'S CONTROL — Settings → Vault → Clipper (docs/capture.md).
//
// A bookmarklet is a bookmark whose address is a line of JavaScript, and the
// only way to make one in a browser is to DRAG a link to the bookmarks bar.
// So the control is that link, styled as a small button, with the token
// already inside it; the reader drags it, and the row's hint says so. Clicking
// it here is prevented — run on this page it would clip the settings panel
// into the vault, which nobody means.
//
// The token is asked for on mount (the server makes one on first ask and
// keeps it in the data directory, never in the vault) and replaced by the
// Renew button. Renewing is the whole revocation story: the old bookmarklet
// stops working, and the new one is a drag away.

import { useEffect, useState } from "react";
import { getClipToken, rotateClipToken } from "../../api.ts";
import { bookmarklet } from "../../../shared/capture.ts";
import { t, tf } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import { toast } from "../../toast.ts";

export function ClipperControl({ siteName }: { siteName: string }) {
  useStore((s) => s.language);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getClipToken()
      .then((r) => {
        if (live) setToken(r.token);
      })
      .catch((err: unknown) => {
        console.error("astrolabe: reading the clip token failed", err);
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const renew = () => {
    if (busy) return;
    setBusy(true);
    rotateClipToken()
      .then((r) => {
        setToken(r.token);
        toast(t("clipperRenewed"));
      })
      .catch((err: unknown) => {
        console.error("astrolabe: renewing the clip token failed", err);
        toast(t("clipperRenewFailed"), "error");
      })
      .finally(() => setBusy(false));
  };

  const href = token
    ? bookmarklet(location.origin, token, { clipped: t("clipperClipped"), failed: t("clipperFailed") })
    : undefined;
  const label = tf("clipperLink", { site: siteName });

  return (
    <div className="s-clipper">
      {failed ? (
        <span className="s-clipper__unavailable">{t("clipperUnavailable")}</span>
      ) : (
        <a
          className="s-clipper__link"
          href={href}
          draggable
          aria-disabled={!token}
          title={t("clipperDragTitle")}
          onClick={(e) => e.preventDefault()}
        >
          <span className="s-clipper__glyph" aria-hidden="true">✂</span>
          {label}
        </a>
      )}
      <button type="button" className="s-clipper__renew" onClick={renew} disabled={busy || !token}>
        {t("clipperRenew")}
      </button>
    </div>
  );
}
