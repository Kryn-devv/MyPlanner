package app.nova.planner;

import java.util.Locale;

/**
 * Decides where a link the WebView is about to follow should go. Pure Java so the rules are
 * unit-tested rather than only exercised by tapping around on a phone.
 *
 * <p>The WebView is a window onto one server and nothing else: pages from that origin stay in
 * the app, ordinary web, mail and phone links go to the apps made for them, and everything else
 * (intent:, javascript:, file:, content:, data: ...) is dropped. That last group is how a page
 * would reach into other apps or the phone's files, and the NOVA web app never needs any of it.
 */
public final class LinkPolicy {

    public enum Decision {
        /** Same origin as the saved server: load it in the WebView. */
        STAY,
        /** Hand to another app with ACTION_VIEW: a browser, the dialer, a mail app. */
        OPEN_OUTSIDE,
        /** Neither: do nothing. */
        BLOCK
    }

    private LinkPolicy() {}

    public static Decision decide(String baseUrl, String url) {
        String scheme = schemeOf(url);
        if (scheme == null) return Decision.BLOCK;
        switch (scheme) {
            case "http":
            case "https":
                // A URL that fails to parse cannot be the server (its address always parses), so
                // the only question left for it is whether some other app wants it.
                return ServerAddress.isSameOrigin(baseUrl, url) ? Decision.STAY : Decision.OPEN_OUTSIDE;
            case "mailto":
            case "tel":
                return Decision.OPEN_OUTSIDE;
            default:
                return Decision.BLOCK;
        }
    }

    /** True for http and https, the only schemes a frame inside a page may load. */
    public static boolean isWebUrl(String url) {
        String scheme = schemeOf(url);
        return "http".equals(scheme) || "https".equals(scheme);
    }

    /**
     * True inside the signed-in part of the web app, which lives under /app. Crossing between
     * this and the signed-out pages (sign in, sign up, password reset) means a session began or
     * ended, and the pages on the other side of that line redirect straight back; keeping them
     * in the back stack would make Back bounce between the two forever instead of leaving.
     */
    public static boolean isSignedInArea(String url) {
        String path = pathOf(url);
        return path != null && (path.equals("/app") || path.startsWith("/app/"));
    }

    private static String schemeOf(String url) {
        if (url == null) return null;
        int colon = url.indexOf(':');
        if (colon <= 0) return null;
        for (int i = 0; i < colon; i++) {
            char c = url.charAt(i);
            boolean ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
                    || (i > 0 && ((c >= '0' && c <= '9') || c == '+' || c == '-' || c == '.'));
            if (!ok) return null;
        }
        return url.substring(0, colon).toLowerCase(Locale.ROOT);
    }

    private static String pathOf(String url) {
        if (url == null) return null;
        int separator = url.indexOf("://");
        if (separator < 0) return null;
        int start = separator + 3;
        int slash = -1;
        for (int i = start; i < url.length(); i++) {
            char c = url.charAt(i);
            if (c == '?' || c == '#') return "/";
            if (c == '/') {
                slash = i;
                break;
            }
        }
        if (slash < 0) return "/";
        int end = url.length();
        for (int i = slash; i < url.length(); i++) {
            char c = url.charAt(i);
            if (c == '?' || c == '#') {
                end = i;
                break;
            }
        }
        return url.substring(slash, end);
    }
}
