package dev.astrolabe.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The phone learns about a new APK the way the desktop learns about a new
 * AppImage: one request to the repository's releases endpoint, once per
 * launch, on a background thread. A sideloaded app cannot update itself — the
 * package installer is the only thing allowed to replace it — so the most this
 * can honestly do is say a release exists and hand the APK to the browser,
 * which downloads it and offers Install. Same signing key, same install id, so
 * the installer treats it as the update it is.
 *
 * Quiet by design: nothing is shown when the app is current, and a release
 * the reader dismissed is not mentioned again for a day.
 */
final class UpdateCheck {
    private static final String LATEST = "https://api.github.com/repos/ZahakJ/astrolabe/releases/latest";
    private static final String PREFS = "astrolabe-update";
    private static final long SNOOZE_MS = 24L * 60 * 60 * 1000;

    private UpdateCheck() {}

    /** The installed version, read from the package: AGP 8 no longer
     *  generates BuildConfig by default, and the manifest is the truth anyway. */
    private static String installedVersion(Activity activity) {
        try {
            String v = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
            return v == null ? "0.0.0" : v;
        } catch (Exception e) {
            return "0.0.0";
        }
    }

    static void run(final Activity activity) {
        final String installed = installedVersion(activity);
        new Thread(() -> {
            try {
                String tag = null;
                String apk = null;
                HttpURLConnection c = (HttpURLConnection) new URL(LATEST).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                c.setRequestProperty("User-Agent", "astrolabe-android/" + installed);
                c.setRequestProperty("Accept", "application/vnd.github+json");
                if (c.getResponseCode() != 200) return;
                StringBuilder body = new StringBuilder();
                try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
                    String line;
                    while ((line = r.readLine()) != null) body.append(line);
                }
                JSONObject release = new JSONObject(body.toString());
                tag = release.optString("tag_name", "");
                JSONArray assets = release.optJSONArray("assets");
                if (assets != null) {
                    for (int i = 0; i < assets.length(); i++) {
                        JSONObject a = assets.getJSONObject(i);
                        String name = a.optString("name", "");
                        if (name.toLowerCase().endsWith(".apk")) {
                            apk = a.optString("browser_download_url", null);
                            break;
                        }
                    }
                }
                if (tag.isEmpty() || apk == null || !newer(tag, installed)) return;
                final String version = tag.startsWith("v") ? tag.substring(1) : tag;
                final String url = apk;
                SharedPreferences prefs = activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
                long snoozedAt = prefs.getLong("snooze:" + version, 0L);
                if (System.currentTimeMillis() - snoozedAt < SNOOZE_MS) return;
                activity.runOnUiThread(() -> offer(activity, version, url));
            } catch (Exception ignored) {
                // A phone without a network, a rate-limited API, a malformed
                // release: none of them is worth a word. The next launch asks again.
            }
        }, "astrolabe-update-check").start();
    }

    private static void offer(final Activity activity, final String version, final String url) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        boolean ar = activity.getResources().getConfiguration().getLocales().get(0).getLanguage().equals("ar");
        String title = ar ? "أسطرلاب " + version + " متاح" : "Astrolabe " + version + " is available";
        String message = ar
            ? "ينزّل المتصفح ملف التثبيت ثم يعرض التثبيت فوق النسخة الحالية؛ ملاحظاتك وإعداداتك تبقى كما هي."
            : "The browser downloads the installer and offers to install it over this copy; your notes and settings stay as they are.";
        String update = ar ? "تحديث" : "Update";
        String later = ar ? "لاحقًا" : "Later";
        new AlertDialog.Builder(activity)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton(update, (d, w) -> {
                try {
                    activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                    // No browser to hand it to: the release page is a tap away in any case.
                }
            })
            .setNegativeButton(later, (d, w) -> {
                activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE)
                    .edit().putLong("snooze:" + version, System.currentTimeMillis()).apply();
            })
            .show();
    }

    /** "v3.4.1" is newer than "3.4.0": numeric parts, left to right. */
    static boolean newer(String remote, String local) {
        int[] a = parts(remote);
        int[] b = parts(local);
        for (int i = 0; i < 3; i++) {
            if (a[i] != b[i]) return a[i] > b[i];
        }
        return false;
    }

    private static int[] parts(String v) {
        String s = v.startsWith("v") ? v.substring(1) : v;
        String[] bits = s.split("[^0-9]+");
        int[] out = new int[3];
        for (int i = 0; i < 3 && i < bits.length; i++) {
            try {
                out[i] = bits[i].isEmpty() ? 0 : Integer.parseInt(bits[i]);
            } catch (NumberFormatException e) {
                out[i] = 0;
            }
        }
        return out;
    }
}
