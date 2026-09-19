package dev.astrolabe.mobile;

import android.os.Bundle;
import android.os.SystemClock;
import android.widget.Toast;
import android.webkit.CookieManager;
import android.webkit.WebBackForwardList;
import android.webkit.WebHistoryItem;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/**
 * The app proper: the connection screen, and then the owner's instance.
 *
 * Capacitor 8 has no opinion about the back gesture — it registers no callback,
 * so the platform default applies and the default is "close the app". In a shell
 * whose whole content is one long-lived web session that is the worst possible
 * behaviour: a reader three notes deep taps back and the app is gone.
 *
 * So back is handled here, in three cases, in this order:
 *
 *   1. On the connection screen → leave, ONCE CONFIRMED. It is the app's front
 *      door; there is nothing behind it. A single tap used to end the session
 *      outright, which is a lot to hang on a gesture a thumb makes by accident
 *      at the edge of a screen — so the first one says so and the second one
 *      goes ({@link #LEAVE_WINDOW_MS}).
 *   2. In the instance, with instance history behind us → go back one page.
 *   3. In the instance, at the first page we loaded → return to the connection
 *      screen, telling it NOT to reconnect (`?pick=1`). Without that flag the
 *      screen would auto-connect straight back into the thing the owner just
 *      backed out of, and the back gesture would have no exit at all.
 *
 * WHAT IS NOT HERE, and deliberately: closing the drawer, the palette, the
 * outline pane or a dialog. Those are LAYERS drawn by the page, this class
 * cannot see them, and "go back one page" was wrong for every one of them —
 * the note underneath changed and the layer stayed. The page answers for its
 * own layers now (client/backGesture.ts): while one is up it keeps a history
 * entry of its own, so case 2's {@code goBack()} pops that entry, closes the
 * layer and navigates nothing. One mechanism, two halves, and the half that
 * knows what is on screen is the half that decides.
 */
public class MainActivity extends BridgeActivity {

    /** How long "press back again to leave" stands. Android's own double-back
     *  idiom uses two seconds; a reader who meant it presses inside that. */
    private static final long LEAVE_WINDOW_MS = 2000L;

    /** When the first of a possible pair of leaving taps arrived, or 0. */
    private long armedAt = 0L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AstrolabePlugin.class);
        super.onCreate(savedInstanceState);

        // The status bar and the gesture bar are drawn over this window from
        // Android 15 on, and the page underneath is usually the owner's own
        // instance, whose CSS this app does not get to edit. See
        // SystemBarInsets for why the shell pads rather than delegating.
        SystemBarInsets.apply(this, bridge);

        // …and those strips are painted in the room the reader is in, not in
        // the brand's, from the page's own `<meta name="theme-color">`.
        ThemeBars.follow(this, bridge);

        // Persisted, not session, cookies: the instance sets `astrolabe_session`
        // with a seven-day Max-Age precisely so a phone does not ask for the
        // password every morning.
        CookieManager.getInstance().setAcceptCookie(true);

        // A newer APK on the release page is offered once per launch and
        // snoozed for a day on "Later" (UpdateCheck). The phone gets every
        // web-side release from the server the moment prod deploys; this is
        // only for the shell itself.
        UpdateCheck.run(this);

        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        if (!goBackOnce()) {
                            // Disable and re-dispatch rather than calling
                            // finish(): that lets the platform run whatever it
                            // normally would, predictive-back animation included.
                            setEnabled(false);
                            getOnBackPressedDispatcher().onBackPressed();
                        }
                    }
                }
            );
    }

    /** @return true if the gesture was consumed; false to let the app close. */
    private boolean goBackOnce() {
        if (bridge == null) return false;
        WebView webView = bridge.getWebView();
        if (webView == null) return false;

        String local = bridge.getLocalUrl();
        WebBackForwardList history = webView.copyBackForwardList();
        WebHistoryItem current = history.getCurrentItem();
        String currentUrl = current == null ? null : current.getUrl();

        // Case 1 — our own screen, or a WebView with nothing in it yet. Ask
        // first: the front door is one thumb-width from the gesture area, and
        // leaving is the one thing here that cannot be undone by pressing
        // back again.
        if (currentUrl == null || currentUrl.startsWith(local)) {
            long now = SystemClock.elapsedRealtime();
            if (armedAt != 0L && now - armedAt <= LEAVE_WINDOW_MS) {
                armedAt = 0L;
                return false;
            }
            armedAt = now;
            Toast.makeText(this, R.string.back_again_to_leave, Toast.LENGTH_SHORT).show();
            return true;
        }

        // Case 2 — the instance has somewhere to go back to that is still the
        // instance.
        int index = history.getCurrentIndex();
        if (index > 0) {
            WebHistoryItem previous = history.getItemAtIndex(index - 1);
            if (previous != null && !previous.getUrl().startsWith(local)) {
                webView.goBack();
                return true;
            }
        }

        // Case 3 — the far end of the instance's own history.
        webView.loadUrl(local + "/index.html?pick=1");
        return true;
    }
}
