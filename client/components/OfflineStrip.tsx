// THE OFFLINE STRIP. Shown in the app shell while the device's copy is what
// is being read (client/offline.ts useOffline) and the session is an
// admin's: an edit made now is kept by the editor's own retry
// (client/editor/saveRetry.ts) until the network is back. It shares the
// preview strip's dress and grid row; while a visitor preview is on, that
// strip has the row.

import { t } from "../i18n.ts";
import { useOffline } from "../offline.ts";
import { useStore } from "../state.ts";

export default function OfflineStrip() {
  const offline = useOffline();
  const preview = useStore((s) => s.previewVisitor);
  useStore((s) => s.language);
  if (!offline || preview) return null;
  return (
    <div className="s-preview-strip s-offline-strip" role="status" data-testid="offline-strip">
      <span className="s-preview-strip__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5a8 8 0 0 1 14 0" />
          <path d="M8.5 15.5a4 4 0 0 1 7 0" />
          <circle cx="12" cy="19" r="1" />
          <path d="M3 3l18 18" />
        </svg>
      </span>
      <span className="s-preview-strip__text">{t("offlineStrip")}</span>
      <span className="s-preview-strip__hint">{t("offlineStripHint")}</span>
    </div>
  );
}
