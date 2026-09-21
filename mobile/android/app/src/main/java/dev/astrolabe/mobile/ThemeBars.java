package dev.astrolabe.mobile;

import android.app.Activity;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.WebView;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.LifecycleOwner;
import com.getcapacitor.Bridge;

/**
 * The strips above and below the page, painted in the room the reader is in.
 *
 * {@link SystemBarInsets} pads the WebView's container so the status bar and
 * the gesture bar have space of their own, and paints that space
 * {@code R.color.ground} — which was right when the shell had one room and the vault the same one — a room
 * there was. It is not: a reader on parchment, linen or porcelain got a cream
 * page with a black band at each end, and the {@code <meta name="theme-color">}
 * the instance has been serving all along (server/manifest.ts) was read by
 * nobody, because a WebView does not act on it the way a browser does.
 *
 * So the shell reads it itself, off the page, and paints the strips to match —
 * light glyphs on a dark ground, dark glyphs on a light one.
 *
 * WHY A POLL, and not a page-load hook. The colour does not change when the
 * PAGE changes; it changes when the READER changes rooms, which is a click
 * inside a single-page app that no navigation callback will ever fire for. A
 * load hook would paint the strips correctly once and then be wrong for the
 * rest of the session, which is the failure this class exists to end. The poll
 * runs only while the activity is resumed, evaluates two property reads, and
 * touches the window only when the answer has actually changed.
 *
 * The client keeps that meta tag on the live theme (client/design/
 * customThemes.ts, `syncThemeColour`); {@code --bg} is read as the fallback so
 * an older instance, served by a server that predates this, is still right.
 */
final class ThemeBars {

    private ThemeBars() {}

    /** Slow enough to be free, fast enough that a room change looks immediate. */
    private static final long EVERY_MS = 900L;

    /**
     * Reads the page's declared chrome colour. Two sources, in order: the meta
     * tag (what every browser uses), then the live `--bg` token (what the tag
     * is generated from). Returns "" when the page is not ours or not ready —
     * a string, because evaluateJavascript hands back a JSON literal.
     */
    private static final String READ_COLOUR =
        "(function(){try{" +
        "var m=document.querySelector('meta[name=\"theme-color\"]');" +
        "var v=m&&m.content?m.content:getComputedStyle(document.documentElement).getPropertyValue('--bg');" +
        "return (v||'').trim();}catch(e){return '';}})()";

    static void follow(final Activity activity, final Bridge bridge) {
        if (bridge == null) return;
        final WebView webView = bridge.getWebView();
        if (webView == null || !(webView.getParent() instanceof View)) return;
        final View container = (View) webView.getParent();

        final int fallback = ContextCompat.getColor(activity, R.color.ground);
        final Handler handler = new Handler(Looper.getMainLooper());
        // Boxed so the lambda can carry state without a field. 1 is "nothing
        // painted yet": every colour this parses is opaque, so its alpha byte
        // is 0xFF and it can never equal 1.
        final int[] painted = { 1 };

        handler.post(
            new Runnable() {
                @Override
                public void run() {
                    if (activity.isFinishing() || activity.isDestroyed()) return;
                    // Only while the activity is RESUMED. A Handler keeps
                    // firing in a backgrounded process, and a colour nobody
                    // can see is not worth a script evaluation every second;
                    // the timer stays armed so the first frame after the
                    // reader comes back is already right.
                    if (!resumed(activity)) {
                        handler.postDelayed(this, EVERY_MS);
                        return;
                    }
                    webView.evaluateJavascript(
                        READ_COLOUR,
                        value -> {
                            int colour = parse(unquote(value), fallback);
                            if (colour != painted[0]) {
                                painted[0] = colour;
                                paint(activity, container, colour);
                            }
                        }
                    );
                    handler.postDelayed(this, EVERY_MS);
                }
            }
        );
    }

    /** Is this activity in the foreground? */
    private static boolean resumed(Activity activity) {
        if (!(activity instanceof LifecycleOwner)) return true;
        return ((LifecycleOwner) activity).getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED);
    }

    /** Paint the strips and choose the glyph colour that survives on them. */
    @SuppressWarnings("deprecation")
    private static void paint(Activity activity, View container, int colour) {
        // From Android 15 the bars are glass over our own content and the
        // strip IS the container's padding, which SystemBarInsets reserved.
        container.setBackgroundColor(colour);
        // Below 15 the platform still owns those two bands and paints them
        // from the window. Deprecated there and ignored from 15 up, so it is
        // set unconditionally and does nothing on the phones that do not need
        // it — one call rather than a version branch that could drift.
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            activity.getWindow().setStatusBarColor(colour);
            activity.getWindow().setNavigationBarColor(colour);
        }
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(
            activity.getWindow(),
            activity.getWindow().getDecorView()
        );
        // Dark glyphs on a light strip, light glyphs on a dark one. The
        // threshold is relative luminance, not "is it white": parchment
        // (#f4ecd8) and linen are pale enough for black text and iron-gall is
        // not, and the two are told apart by the same number a contrast gate
        // would use.
        boolean light = luminance(colour) > 0.5;
        bars.setAppearanceLightStatusBars(light);
        bars.setAppearanceLightNavigationBars(light);
    }

    /** `evaluateJavascript` returns a JSON string literal, quotes included. */
    private static String unquote(String value) {
        if (value == null) return "";
        String s = value.trim();
        if (s.length() >= 2 && s.charAt(0) == '"' && s.charAt(s.length() - 1) == '"') {
            s = s.substring(1, s.length() - 1);
        }
        return s.replace("\\\"", "\"").trim();
    }

    /**
     * `#rgb`, `#rrggbb`, `#rrggbbaa` and `rgb()`/`rgba()`. A token read out of
     * a live stylesheet arrives in whichever of those the theme's author wrote,
     * and getComputedStyle on a custom property does NOT normalise it — so all
     * of them, or the fallback. `color(srgb …)`, which a hand-written theme
     * may use, falls through to the fallback rather than being half-parsed.
     */
    private static int parse(String text, int fallback) {
        if (text.isEmpty()) return fallback;
        try {
            if (text.charAt(0) == '#') {
                // #rrggbbaa: Color.parseColor wants #aarrggbb, so re-order it
                // rather than handing it a string it will read as garbage.
                if (text.length() == 9) {
                    return Color.parseColor("#" + text.substring(7, 9) + text.substring(1, 7));
                }
                return Color.parseColor(text);
            }
            if (text.startsWith("rgb")) {
                int open = text.indexOf('(');
                int close = text.indexOf(')');
                if (open < 0 || close < open) return fallback;
                String[] parts = text.substring(open + 1, close).split("[,/\\s]+");
                if (parts.length < 3) return fallback;
                return Color.rgb(
                    clamp(Integer.parseInt(parts[0].trim())),
                    clamp(Integer.parseInt(parts[1].trim())),
                    clamp(Integer.parseInt(parts[2].trim()))
                );
            }
        } catch (IllegalArgumentException | IndexOutOfBoundsException ignored) {
            // A theme with a colour this cannot read keeps the brand ground —
            // wrong-but-legible beats an exception on the UI thread.
        }
        return fallback;
    }

    private static int clamp(int channel) {
        return Math.max(0, Math.min(255, channel));
    }

    /** Rec. 709 relative luminance, 0 (black) to 1 (white). */
    private static double luminance(int colour) {
        return (
            0.2126 * (Color.red(colour) / 255.0) +
            0.7152 * (Color.green(colour) / 255.0) +
            0.0722 * (Color.blue(colour) / 255.0)
        );
    }
}
