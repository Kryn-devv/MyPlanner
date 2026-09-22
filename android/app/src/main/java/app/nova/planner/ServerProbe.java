package app.nova.planner;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.ProtocolException;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import javax.net.ssl.SSLException;

/**
 * Checks that an address really is a NOVA server before the app commits to it, so a typo shows
 * up as a clear sentence on the connect screen instead of a blank WebView.
 *
 * <p>Only java.net is used, which behaves the same on a phone and in a JVM unit test, so the
 * tests can run it against a real local HTTP server. It blocks; callers run it off the main
 * thread (Android refuses network access there outright).
 */
public final class ServerProbe {

    public enum Outcome {
        OK,
        /** Something answered, but not with NOVA's sign-in page. */
        NOT_NOVA,
        /**
         * The address redirects to a different one, such as www.example.com or a router's admin
         * page; {@link Result#redirectTarget} names it. The redirect is not followed, because the
         * app would then be saving one address while showing pages from another.
         */
        FORWARDS_ELSEWHERE,
        /** It looks like the server, but it answered with a 5xx error. */
        SERVER_ERROR,
        /** Refused or no route: nothing is listening there, or the network is in the way. */
        UNREACHABLE,
        /**
         * The connection itself was never answered: usually a sleeping PC or a firewall silently
         * dropping packets.
         */
        TIMED_OUT,
        /**
         * The server accepted the connection but did not send the page in time. It is there, just
         * slow: typically a development server still compiling the sign-in page on its first
         * request, which a second try a few seconds later gets straight away.
         */
        SLOW_TO_ANSWER,
        /** The name does not resolve, so it is almost certainly mistyped. */
        UNKNOWN_HOST,
        /** An https address whose certificate this phone does not trust. */
        TLS_FAILED
    }

    public static final class Result {
        public final Outcome outcome;
        /** The HTTP status when there was a response at all, otherwise 0. */
        public final int httpStatus;
        /**
         * The server address this result is about, which is the one to save on OK. It is the
         * address checked, except that an http address forwarding to https on the same host is
         * checked, and reported, as that https address.
         */
        public final String baseUrl;
        /** For FORWARDS_ELSEWHERE, the base URL the address forwards to; otherwise null. */
        public final String redirectTarget;

        Result(Outcome outcome, int httpStatus, String baseUrl, String redirectTarget) {
            this.outcome = outcome;
            this.httpStatus = httpStatus;
            this.baseUrl = baseUrl;
            this.redirectTarget = redirectTarget;
        }
    }

    /** What {@link #check} does with one redirect; see {@link #redirect}. */
    enum RedirectKind {
        /** Same origin: request the target and judge that page instead. */
        FOLLOW,
        /** The same host over https: check that https address from the start and save it. */
        UPGRADE,
        /** Anywhere else: report it, never follow it. */
        ELSEWHERE,
        /** No usable Location header. */
        INVALID
    }

    static final class Redirect {
        final RedirectKind kind;
        /** FOLLOW: the URL to request next. UPGRADE and ELSEWHERE: the base URL it leads to. */
        final String target;

        Redirect(RedirectKind kind, String target) {
            this.kind = kind;
            this.target = target;
        }
    }

    /** Long enough for a phone waking its Wi-Fi radio, short enough that a wrong IP fails fast. */
    public static final int DEFAULT_TIMEOUT_MS = 6000;

    /**
     * Every page the Next.js server renders loads its scripts and styles from /_next/, so the
     * path in the sign-in page's HTML is a stable fingerprint that survives a rebrand of the app
     * name and a server configured not to send the X-Powered-By header.
     */
    static final String NEXT_MARKER = "/_next/";

    /** The marker sits in the document head; there is no reason to download a whole page. */
    static final int MAX_BODY_BYTES = 256 * 1024;

    /**
     * Enough for an http-to-https upgrade plus a same-origin hop or two (a trailing slash, a
     * locale prefix). NOVA's own sign-in page never redirects a request without cookies, so a
     * longer chain is a loop or something in front of NOVA that is not NOVA.
     */
    static final int MAX_REDIRECTS = 3;

    private ServerProbe() {}

    /**
     * Requests {@code <baseUrl>/login} and classifies what comes back. Never throws.
     *
     * <p>Redirects are judged one hop at a time rather than accepted as proof of a server. Nearly
     * every host and proxy sends plain http on to https, and a router or captive portal sends
     * everything to its own page; saving the address typed in either case would leave the app
     * bounced out to the browser on every launch, since the WebView keeps only the saved origin.
     */
    public static Result check(String baseUrl, int timeoutMs) {
        String base = baseUrl;
        String url = baseUrl + "/login";
        for (int redirects = 0; ; redirects++) {
            Response response = fetch(url, timeoutMs);
            if (response.failure != null) return new Result(response.failure, 0, base, null);
            if (!isRedirect(response.status)) {
                Outcome outcome = classify(response.status, response.poweredBy, response.body);
                return new Result(outcome, Math.max(response.status, 0), base, null);
            }
            if (redirects == MAX_REDIRECTS) return new Result(Outcome.NOT_NOVA, response.status, base, null);

            Redirect next = redirect(base, url, response.location);
            switch (next.kind) {
                case FOLLOW:
                    url = next.target;
                    break;
                case UPGRADE:
                    base = next.target;
                    url = base + "/login";
                    break;
                case ELSEWHERE:
                    return new Result(Outcome.FORWARDS_ELSEWHERE, response.status, base, next.target);
                case INVALID:
                default:
                    return new Result(Outcome.NOT_NOVA, response.status, base, null);
            }
        }
    }

    /**
     * Where a redirect from {@code requestUrl} (on the server at {@code baseUrl}) leads. Origins
     * are compared with ServerAddress, the same rules the WebView's links are held to, so a hop
     * this follows is one the app would also have kept on the server.
     */
    static Redirect redirect(String baseUrl, String requestUrl, String location) {
        if (location == null || location.trim().isEmpty()) return new Redirect(RedirectKind.INVALID, null);
        String resolved;
        try {
            resolved = URI.create(requestUrl).resolve(location.trim()).toString();
        } catch (IllegalArgumentException e) {
            return new Redirect(RedirectKind.INVALID, null);
        }
        ServerAddress.Origin from = ServerAddress.origin(baseUrl);
        ServerAddress.Origin to = ServerAddress.origin(resolved);
        if (from == null || to == null) return new Redirect(RedirectKind.INVALID, null);
        if (to.equals(from)) return new Redirect(RedirectKind.FOLLOW, resolved);
        // Someone typing "nova.example.com" gets http:// added for them; if that host then
        // insists on https, the https address is plainly the one they meant. Only an upgrade on
        // the same host is taken: a move from https to http, or to another host, is reported.
        if (from.scheme.equals("http") && to.scheme.equals("https") && to.host.equals(from.host)) {
            return new Redirect(RedirectKind.UPGRADE, to.toBaseUrl());
        }
        return new Redirect(RedirectKind.ELSEWHERE, to.toBaseUrl());
    }

    private static boolean isRedirect(int status) {
        return status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
    }

    /** One GET's response, or the outcome that ended it before there was one. */
    private static final class Response {
        int status;
        String poweredBy;
        String location;
        String body;
        Outcome failure;
    }

    private static Response fetch(String url, int timeoutMs) {
        Response response = new Response();
        HttpURLConnection connection = null;
        boolean connected = false;
        try {
            connection = (HttpURLConnection) URI.create(url).toURL().openConnection();
            connection.setConnectTimeout(timeoutMs);
            connection.setReadTimeout(timeoutMs);
            // check() judges each redirect itself; HttpURLConnection would follow any of them,
            // including to a different host the saved address would not match.
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "text/html");

            // Connecting separately is what tells the two kinds of timeout apart (see below).
            connection.connect();
            connected = true;
            response.status = connection.getResponseCode();
            response.poweredBy = connection.getHeaderField("X-Powered-By");
            response.location = connection.getHeaderField("Location");
            if (response.status >= 200 && response.status < 300) {
                try (InputStream in = connection.getInputStream()) {
                    response.body = readPrefix(in);
                }
            }
        } catch (SocketTimeoutException e) {
            // Before connect() returns, nothing has answered at all, which is how a sleeping PC
            // or a firewall dropping packets looks. After it, the server is plainly there and
            // only slow, so blaming the firewall would send the person to fix the wrong thing.
            response.failure = connected ? Outcome.SLOW_TO_ANSWER : Outcome.TIMED_OUT;
        } catch (UnknownHostException e) {
            response.failure = Outcome.UNKNOWN_HOST;
        } catch (SSLException e) {
            response.failure = Outcome.TLS_FAILED;
        } catch (ProtocolException e) {
            // Something is listening but does not speak HTTP.
            response.failure = Outcome.NOT_NOVA;
        } catch (IOException | RuntimeException e) {
            // RuntimeException covers what URI.create and some network stacks throw for input
            // that slipped past normalization; the screen reports it as "could not connect".
            response.failure = Outcome.UNREACHABLE;
        } finally {
            if (connection != null) connection.disconnect();
        }
        return response;
    }

    /**
     * The pure decision behind {@link #check} for a response that is not a redirect (check()
     * resolves those first), separated so every branch is easy to test. A 3xx that gets here,
     * such as 304 or 300, is not a sign-in page, so it counts as not NOVA like any other.
     */
    static Outcome classify(int status, String poweredBy, String bodyPrefix) {
        if (status >= 200 && status < 300) {
            boolean nextHeader = poweredBy != null && poweredBy.toLowerCase(Locale.ROOT).contains("next.js");
            boolean nextBody = bodyPrefix != null && bodyPrefix.contains(NEXT_MARKER);
            return nextHeader || nextBody ? Outcome.OK : Outcome.NOT_NOVA;
        }
        if (status >= 500 && status < 600) return Outcome.SERVER_ERROR;
        return Outcome.NOT_NOVA;
    }

    /**
     * Reads at most {@link #MAX_BODY_BYTES}, stopping early once the marker is seen. ISO-8859-1
     * maps each byte to one char, which is all an ASCII search needs whatever the page encoding.
     */
    private static String readPrefix(InputStream in) throws IOException {
        byte[] buffer = new byte[MAX_BODY_BYTES];
        int length = 0;
        int read;
        while (length < buffer.length && (read = in.read(buffer, length, buffer.length - length)) != -1) {
            // Look only at the new bytes plus enough overlap to catch a marker split across reads.
            int from = Math.max(0, length - NEXT_MARKER.length());
            length += read;
            if (new String(buffer, from, length - from, StandardCharsets.ISO_8859_1).contains(NEXT_MARKER)) break;
        }
        return new String(buffer, 0, length, StandardCharsets.ISO_8859_1);
    }
}
