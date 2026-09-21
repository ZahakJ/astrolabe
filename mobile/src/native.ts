import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** What a share sent us. Android hands over EXTRA_TEXT (the URL or the
 *  selection) and, for a page share, EXTRA_SUBJECT (its title). Either can be
 *  absent; a share with neither is not a capture and the sheet says so. */
export interface PendingShare {
  text?: string;
  subject?: string;
}

export interface AstrolabeNativePlugin {
  /** The share this ACTIVITY was started with, if it was started by one. Read
   *  off the activity's own Intent rather than a static, so the connection
   *  screen and the capture sheet cannot ever see each other's launch. */
  pendingShare(): Promise<PendingShare>;

  /** A SECOND share, arriving at a sheet that is already up. The native side
   *  pushes it rather than reloading the page, because a reload asked for
   *  inside the activity's new-intent turn never happens — see
   *  ShareActivity.onNewIntent for the whole of that story. */
  addListener(eventName: "share", listener: (share: PendingShare) => void): Promise<PluginListenerHandle>;

  /** Trust this origin and go there. The host is remembered natively because
   *  the gate that uses it (`shouldOverrideLoad`) runs on pages where no
   *  Capacitor bridge exists — the served app is not our code. */
  connect(options: { url: string }): Promise<void>;

  /** Dismiss the capture sheet's activity. */
  closeShare(): Promise<void>;

  /** Hand the WebView to the POCKET vault — the web client's own build,
   *  served from this app's origin at /pocket.html, reading the git clone in
   *  the app's private storage. Drops the trusted host on the way, because a
   *  pocket session has no instance behind it and a stale one must not keep
   *  counting as same-app. */
  openPocket(): Promise<void>;

  /** ONE GIT REQUEST, PERFORMED NATIVELY (android/…/GitTransport.java).
   *  github.com's git endpoints ship no CORS headers, so a page cannot call
   *  them; and a push's body is a packfile, so it cannot travel as a string —
   *  hence base64 in both directions and a method of its own rather than
   *  CapacitorHttp. */
  gitRequest(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    bodyBase64?: string;
  }): Promise<{ status: number; statusText: string; headers: Record<string, string>; bodyBase64: string }>;
}

export const AstrolabeNative = registerPlugin<AstrolabeNativePlugin>("Astrolabe");
