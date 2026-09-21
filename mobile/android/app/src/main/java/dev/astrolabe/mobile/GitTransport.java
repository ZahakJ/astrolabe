package dev.astrolabe.mobile;

import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

/**
 * ONE HTTP REQUEST, BINARY BOTH WAYS — what git transport needs and a WebView
 * cannot give it.
 *
 * The pocket vault clones and pushes with isomorphic-git, and git's smart-HTTP
 * endpoints on github.com ship no CORS headers at all. A page cannot call them.
 * That is the same wall the capture sheet already meets, and the shell's answer
 * has always been to perform the request natively instead
 * ({@code CapacitorHttp}, see src/server.ts) — but {@code CapacitorHttp} moves
 * a request body as a STRING. A fetch's body is pkt-lines and survives that; a
 * PUSH's body is a packfile, and a packfile that has been through a UTF-8
 * round trip is not a packfile any more.
 *
 * So this: url in, base64 body in, base64 body out, no interpretation of
 * either. It is the smallest thing that can be correct, and it is the reason
 * the pocket needs no proxy between the phone and GitHub.
 *
 * WHAT IT IS NOT ALLOWED TO BE: a general-purpose fetch for the page. The
 * page that calls it is the app's own bundled code on the app's own origin;
 * the token it sends is the one the owner authorised through GitHub's device
 * flow, and it rides in an ordinary Authorization header that this class never
 * reads, stores or logs.
 */
final class GitTransport {

    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 120000;
    /** A clone of a large vault is megabytes; a phone is not a place to
     *  discover that a single response was a gigabyte. */
    private static final int MAX_BODY_BYTES = 192 * 1024 * 1024;
    /** GitHub answers 301 for a repository that has been renamed, and a clone
     *  that gives up there is a vault the owner cannot reach for a reason
     *  nothing says out loud. */
    private static final int MAX_REDIRECTS = 5;

    private GitTransport() {}

    /**
     * @param url        the git endpoint (…/info/refs?service=…, …/git-upload-pack)
     * @param method     GET or POST
     * @param headers    exactly what isomorphic-git asked for, plus Authorization
     * @param bodyBase64 the request body, or null
     * @return {@code { status, statusText, headers: {…}, bodyBase64 }}
     */
    static JSONObject request(String url, String method, JSONObject headers, String bodyBase64) throws Exception {
        String at = url;
        for (int hop = 0; hop < MAX_REDIRECTS; hop++) {
            JSONObject answer = once(at, method, headers, bodyBase64);
            int status = answer.optInt("status");
            String location = answer.optJSONObject("headers") == null
                ? null
                : answer.optJSONObject("headers").optString("location", null);
            if ((status == 301 || status == 302 || status == 307 || status == 308) && location != null) {
                at = new URL(new URL(at), location).toString();
                continue;
            }
            return answer;
        }
        throw new IllegalStateException("Too many redirects");
    }

    private static JSONObject once(String url, String method, JSONObject headers, String bodyBase64) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setRequestMethod(method == null ? "GET" : method.toUpperCase());
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            // Redirects are followed by hand below rather than by
            // HttpURLConnection, which drops the method and the body on a 301
            // — and GitHub answers 301 for a repository that has been renamed.
            connection.setInstanceFollowRedirects(false);

            if (headers != null) {
                for (java.util.Iterator<String> it = headers.keys(); it.hasNext(); ) {
                    String name = it.next();
                    connection.setRequestProperty(name, headers.optString(name, ""));
                }
            }

            if (bodyBase64 != null) {
                byte[] body = Base64.decode(bodyBase64, Base64.DEFAULT);
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(body.length);
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(body);
                }
            }

            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            byte[] bytes = stream == null ? new byte[0] : readAll(stream);

            JSONObject out = new JSONObject();
            out.put("status", status);
            out.put("statusText", connection.getResponseMessage() == null ? "" : connection.getResponseMessage());
            out.put("bodyBase64", Base64.encodeToString(bytes, Base64.NO_WRAP));

            JSONObject responseHeaders = new JSONObject();
            for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
                // The status line arrives as a header with a null name.
                if (entry.getKey() == null || entry.getValue().isEmpty()) continue;
                responseHeaders.put(entry.getKey().toLowerCase(), entry.getValue().get(0));
            }
            out.put("headers", responseHeaders);
            return out;
        } finally {
            connection.disconnect();
        }
    }

    private static byte[] readAll(InputStream stream) throws Exception {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[64 * 1024];
        int read;
        int total = 0;
        while ((read = stream.read(chunk)) != -1) {
            total += read;
            if (total > MAX_BODY_BYTES) throw new IllegalStateException("Response too large");
            buffer.write(chunk, 0, read);
        }
        stream.close();
        return buffer.toByteArray();
    }
}
