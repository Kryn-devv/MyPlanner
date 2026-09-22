package app.nova.planner;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Everything the app decides about server addresses, kept free of android.* so it runs as a
 * plain JVM unit test (android.net.Uri would need a device or Robolectric to exercise).
 *
 * <p>It has two jobs: turn whatever someone types on the connect screen into one canonical base
 * URL such as {@code http://192.168.1.5:3000}, and tell whether a URL the WebView is about to
 * open belongs to that server. Both go through the same parser, so the saved address and the
 * links compared against it can never disagree about what the host or port is.
 *
 * <p>The canonical form is the one Chromium's URL parser produces: lowercase scheme and host,
 * dotted-decimal IPv4, compressed lowercase IPv6, default port left out. That matters because
 * the WebView hands back URLs it has already canonicalized, and comparing them with a different
 * spelling of the same host would send every link on the server out to the browser.
 */
public final class ServerAddress {

    /** Why an address was rejected. Each one gets its own sentence on the connect screen. */
    public enum Problem {
        EMPTY,
        /** A scheme other than http or https, such as ftp:// or mailto:. */
        UNSUPPORTED_SCHEME,
        /** An IPv6 literal typed without the square brackets a URL needs around it. */
        IPV6_NEEDS_BRACKETS,
        INVALID
    }

    public static final class InvalidException extends Exception {
        public final Problem problem;

        InvalidException(Problem problem) {
            super(problem.name());
            this.problem = problem;
        }
    }

    /** A scheme, host and effective port: what the web platform calls an origin. */
    public static final class Origin {
        public final String scheme;
        /** Canonical host; an IPv6 literal keeps its brackets. */
        public final String host;
        /** Always explicit: the scheme's default port is filled in when the URL omits it. */
        public final int port;

        Origin(String scheme, String host, int port) {
            this.scheme = scheme;
            this.host = host;
            this.port = port;
        }

        /** The base URL for this origin, with the default port left out as Chromium does. */
        public String toBaseUrl() {
            return port == defaultPort(scheme) ? scheme + "://" + host : scheme + "://" + host + ":" + port;
        }

        @Override
        public boolean equals(Object other) {
            if (!(other instanceof Origin)) return false;
            Origin that = (Origin) other;
            return port == that.port && scheme.equals(that.scheme) && host.equals(that.host);
        }

        @Override
        public int hashCode() {
            return (scheme.hashCode() * 31 + host.hashCode()) * 31 + port;
        }

        @Override
        public String toString() {
            return toBaseUrl();
        }
    }

    private static final Pattern SCHEME_SYNTAX = Pattern.compile("[A-Za-z][A-Za-z0-9+.-]*");

    /**
     * What may follow "host:" when the colon starts a port rather than ending a scheme. The port
     * may be empty here so that "localhost:" is reported as a bad address, not a bad scheme.
     */
    private static final Pattern PORT_THEN_REST = Pattern.compile("[0-9]*([/?#\\\\].*)?");

    /**
     * Schemes whose links are digits after the colon ("tel:5551234"), which would otherwise read
     * as a host named "tel" with a port. Nobody names a server on their Wi-Fi after one of these.
     */
    private static final Pattern LINK_ONLY_SCHEMES =
            Pattern.compile("(?i)tel|sms|smsto|mms|mmsto|fax|callto|sip|sips|geo");

    private static final Pattern BARE_IPV6 = Pattern.compile("[0-9A-Fa-f:.]*:[0-9A-Fa-f.]*:[0-9A-Fa-f:.]*");

    /**
     * A host called "http" or "https", which is what "http//192.168.1.5:3000" (the colon left
     * out) would otherwise parse as. Nobody names a machine after a scheme, so it is a mistyped
     * one; accepting it would turn the typed IP address into "http://http".
     */
    private static final Pattern MISTYPED_SCHEME = Pattern.compile("(?i)https?([:/?#\\\\].*)?");

    private static final Pattern HOST_LABEL = Pattern.compile("[a-z0-9]([a-z0-9-]*[a-z0-9])?");

    private ServerAddress() {}

    /**
     * Turns what someone typed into a canonical base URL, or says why it cannot.
     *
     * <p>http:// is assumed when no scheme is given, because a server on home Wi-Fi is almost
     * always plain HTTP. Any path, query or fragment is dropped: the app always opens the
     * server's own /app, so a pasted "http://192.168.1.5:3000/app/today" still means the server.
     */
    public static String normalize(String input) throws InvalidException {
        String text = stripEdges(input == null ? "" : input);
        if (text.isEmpty()) throw new InvalidException(Problem.EMPTY);
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            // Spaces inside, control characters and non-ASCII (internationalized names would
            // need punycode) all mean this is not something a phone could connect to as typed.
            if (c <= ' ' || c >= 0x7f) throw new InvalidException(Problem.INVALID);
        }

        String scheme;
        String rest;
        int separator = text.indexOf("://");
        if (separator >= 0) {
            scheme = text.substring(0, separator).toLowerCase(Locale.ROOT);
            if (!SCHEME_SYNTAX.matcher(scheme).matches()) throw new InvalidException(Problem.INVALID);
            if (!isWebScheme(scheme)) throw new InvalidException(Problem.UNSUPPORTED_SCHEME);
            rest = text.substring(separator + 3);
        } else {
            int colon = text.indexOf(':');
            if (colon > 0 && LINK_ONLY_SCHEMES.matcher(text.substring(0, colon)).matches()) {
                throw new InvalidException(Problem.UNSUPPORTED_SCHEME);
            }
            if (colon > 0
                    && SCHEME_SYNTAX.matcher(text.substring(0, colon)).matches()
                    && !PORT_THEN_REST.matcher(text.substring(colon + 1)).matches()) {
                // "mailto:me", "javascript:..." and an unbracketed IPv6 address like "fe80::1"
                // all look like "word:not-a-port", so tell them apart before complaining.
                if (BARE_IPV6.matcher(text).matches()) throw new InvalidException(Problem.IPV6_NEEDS_BRACKETS);
                String candidate = text.substring(0, colon).toLowerCase(Locale.ROOT);
                // "http:/192.168.1.5" is a typo in a web address, not a different kind of link.
                throw new InvalidException(isWebScheme(candidate) ? Problem.INVALID : Problem.UNSUPPORTED_SCHEME);
            }
            if (MISTYPED_SCHEME.matcher(text).matches()) throw new InvalidException(Problem.INVALID);
            scheme = "http";
            rest = text;
        }

        String authority = rest.substring(0, endOfAuthority(rest));
        // A user name or password in the address would be sent to the server on every request
        // and shown in plain text on screen; NOVA never needs one, so it is refused outright.
        if (authority.indexOf('@') >= 0) throw new InvalidException(Problem.INVALID);
        return parseAuthority(scheme, authority).toBaseUrl();
    }

    /**
     * The origin of an http or https URL, or null when the URL is anything else or does not
     * parse. This is lenient only where the URL standard is (a user:password@ prefix is not part
     * of the origin); anything it cannot parse is treated as foreign, never as the server.
     */
    public static Origin origin(String url) {
        if (url == null) return null;
        int separator = url.indexOf("://");
        if (separator <= 0) return null;
        String scheme = url.substring(0, separator).toLowerCase(Locale.ROOT);
        if (!isWebScheme(scheme)) return null;
        String rest = url.substring(separator + 3);
        String authority = rest.substring(0, endOfAuthority(rest));
        int at = authority.lastIndexOf('@');
        if (at >= 0) authority = authority.substring(at + 1);
        try {
            return parseAuthority(scheme, authority);
        } catch (InvalidException e) {
            return null;
        }
    }

    /** True only when both URLs parse and their scheme, host and effective port all match. */
    public static boolean isSameOrigin(String baseUrl, String url) {
        Origin base = origin(baseUrl);
        return base != null && base.equals(origin(url));
    }

    /**
     * True for a plain-http address on port 80. NOVA's own server listens on 3000, so an address
     * with no port is the most common reason a connection is refused, and worth a hint.
     */
    public static boolean usesDefaultHttpPort(String baseUrl) {
        Origin origin = origin(baseUrl);
        return origin != null && origin.scheme.equals("http") && origin.port == 80;
    }

    /**
     * True when the address points at the device it is typed on: localhost, 127.x.x.x, [::1],
     * or the "any address" 0.0.0.0 and [::], which connect to the device itself too. Next.js
     * prints its Local address (localhost) first, so it is the likeliest wrong one to copy, and
     * on the phone it reaches the phone rather than the PC. Such addresses are still allowed,
     * since adb reverse makes localhost on the phone reach a PC on purpose; this only lets the
     * connect screen explain a failure properly.
     */
    public static boolean isLoopback(String baseUrl) {
        Origin origin = origin(baseUrl);
        if (origin == null) return false;
        String host = origin.host;
        if (host.equals("localhost") || host.endsWith(".localhost")) return true;
        if (host.startsWith("[")) {
            int[] pieces = parseIpv6(host.substring(1, host.length() - 1));
            if (pieces == null) return false;
            for (int i = 0; i < 5; i++) {
                if (pieces[i] != 0) return false;
            }
            // ::1 and ::, or the same IPv4 addresses written as ::ffff:127.0.0.1 or ::ffff:0.0.0.0.
            if (pieces[5] == 0) return pieces[6] == 0 && (pieces[7] == 0 || pieces[7] == 1);
            return pieces[5] == 0xffff && ((pieces[6] >> 8) == 127 || (pieces[6] == 0 && pieces[7] == 0));
        }
        int[] octets = parseIpv4(host);
        return octets != null && (octets[0] == 127 || (octets[0] | octets[1] | octets[2] | octets[3]) == 0);
    }

    static int defaultPort(String scheme) {
        return scheme.equals("https") ? 443 : 80;
    }

    private static boolean isWebScheme(String lowercaseScheme) {
        return lowercaseScheme.equals("http") || lowercaseScheme.equals("https");
    }

    /**
     * Where the host and port end. A backslash counts, as it does in browsers for http(s), so
     * "http://evil.example\@192.168.1.5/" is read as evil.example, exactly as the WebView would.
     */
    private static int endOfAuthority(String rest) {
        for (int i = 0; i < rest.length(); i++) {
            char c = rest.charAt(i);
            if (c == '/' || c == '?' || c == '#' || c == '\\') return i;
        }
        return rest.length();
    }

    private static Origin parseAuthority(String scheme, String authority) throws InvalidException {
        if (authority.isEmpty()) throw new InvalidException(Problem.INVALID);

        String host;
        String portText = null;
        if (authority.charAt(0) == '[') {
            int close = authority.indexOf(']');
            if (close < 0) throw new InvalidException(Problem.INVALID);
            int[] pieces = parseIpv6(authority.substring(1, close));
            if (pieces == null) throw new InvalidException(Problem.INVALID);
            host = "[" + formatIpv6(pieces) + "]";
            String after = authority.substring(close + 1);
            if (!after.isEmpty()) {
                if (after.charAt(0) != ':') throw new InvalidException(Problem.INVALID);
                portText = after.substring(1);
            }
        } else {
            int colon = authority.indexOf(':');
            if (colon >= 0 && authority.indexOf(':', colon + 1) >= 0) {
                throw new InvalidException(
                        BARE_IPV6.matcher(authority).matches() ? Problem.IPV6_NEEDS_BRACKETS : Problem.INVALID);
            }
            if (colon >= 0) portText = authority.substring(colon + 1);
            host = canonicalHost(colon < 0 ? authority : authority.substring(0, colon));
        }

        int port = portText == null ? defaultPort(scheme) : parsePort(portText);
        return new Origin(scheme, host, port);
    }

    private static int parsePort(String text) throws InvalidException {
        // Leading zeros are harmless in a port ("03000" is 3000 to every parser), unlike in IPv4.
        if (text.isEmpty() || text.length() > 5) throw new InvalidException(Problem.INVALID);
        int port = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c < '0' || c > '9') throw new InvalidException(Problem.INVALID);
            port = port * 10 + (c - '0');
        }
        if (port < 1 || port > 65535) throw new InvalidException(Problem.INVALID);
        return port;
    }

    private static String canonicalHost(String name) throws InvalidException {
        if (name.isEmpty() || name.length() > 253) throw new InvalidException(Problem.INVALID);
        String lower = name.toLowerCase(Locale.ROOT);
        String[] labels = lower.split("\\.", -1);

        // Browsers read any host whose last label is a number as an IPv4 address, including
        // shorthand like "10.1" and hex like "0x7f.1". Only the plain dotted quad is accepted,
        // so what is saved is exactly what the WebView will connect to.
        String last = labels[labels.length - 1];
        if (isNumericLabel(last)) {
            int[] octets = parseIpv4(lower);
            if (octets == null) throw new InvalidException(Problem.INVALID);
            return octets[0] + "." + octets[1] + "." + octets[2] + "." + octets[3];
        }

        for (String label : labels) {
            if (label.length() > 63 || !HOST_LABEL.matcher(label).matches()) {
                throw new InvalidException(Problem.INVALID);
            }
        }
        return lower;
    }

    private static boolean isNumericLabel(String label) {
        if (label.isEmpty()) return false;
        if (label.startsWith("0x")) return true;
        for (int i = 0; i < label.length(); i++) {
            char c = label.charAt(i);
            if (c < '0' || c > '9') return false;
        }
        return true;
    }

    /**
     * Strict dotted-decimal IPv4, or null. A leading zero ("192.168.01.5") is refused rather than
     * guessed at: browsers read such a part as octal, so "010" would silently become 8.
     */
    static int[] parseIpv4(String text) {
        String[] parts = text.split("\\.", -1);
        if (parts.length != 4) return null;
        int[] octets = new int[4];
        for (int i = 0; i < 4; i++) {
            String part = parts[i];
            if (part.isEmpty() || part.length() > 3) return null;
            if (part.length() > 1 && part.charAt(0) == '0') return null;
            int value = 0;
            for (int j = 0; j < part.length(); j++) {
                char c = part.charAt(j);
                if (c < '0' || c > '9') return null;
                value = value * 10 + (c - '0');
            }
            if (value > 255) return null;
            octets[i] = value;
        }
        return octets;
    }

    /** The eight 16-bit pieces of an IPv6 literal (without brackets), or null. */
    static int[] parseIpv6(String text) {
        if (text.isEmpty()) return null;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            boolean allowed = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
                    || c == ':' || c == '.';
            // A zone such as %wlan0 is refused with everything else: browsers do not accept one.
            if (!allowed) return null;
        }

        String s = text;
        int lastColon = s.lastIndexOf(':');
        if (lastColon < 0) return null;
        if (s.indexOf('.') >= 0) {
            // An embedded IPv4 tail (::ffff:192.168.1.5) stands for the last two pieces.
            int[] octets = parseIpv4(s.substring(lastColon + 1));
            if (octets == null) return null;
            s = s.substring(0, lastColon + 1)
                    + Integer.toHexString((octets[0] << 8) | octets[1]) + ":"
                    + Integer.toHexString((octets[2] << 8) | octets[3]);
        }

        int gap = s.indexOf("::");
        if (gap >= 0 && s.indexOf("::", gap + 1) >= 0) return null;
        int[] pieces = new int[8];
        if (gap < 0) {
            int[] all = parseIpv6Pieces(s);
            if (all == null || all.length != 8) return null;
            return all;
        }
        int[] head = parseIpv6Pieces(s.substring(0, gap));
        int[] tail = parseIpv6Pieces(s.substring(gap + 2));
        // "::" must stand for at least one zero piece, so at most seven may be written out.
        if (head == null || tail == null || head.length + tail.length > 7) return null;
        System.arraycopy(head, 0, pieces, 0, head.length);
        System.arraycopy(tail, 0, pieces, 8 - tail.length, tail.length);
        return pieces;
    }

    private static int[] parseIpv6Pieces(String part) {
        if (part.isEmpty()) return new int[0];
        String[] groups = part.split(":", -1);
        int[] pieces = new int[groups.length];
        for (int i = 0; i < groups.length; i++) {
            String group = groups[i];
            if (group.isEmpty() || group.length() > 4 || group.indexOf('.') >= 0) return null;
            pieces[i] = Integer.parseInt(group, 16);
        }
        return pieces;
    }

    /**
     * Serializes eight pieces the way the URL standard (and so Chromium) does: lowercase hex
     * without leading zeros, and the first longest run of two or more zero pieces written "::".
     */
    static String formatIpv6(int[] pieces) {
        int compress = -1;
        int bestLength = 1;
        for (int i = 0; i < 8; ) {
            if (pieces[i] != 0) {
                i++;
                continue;
            }
            int end = i;
            while (end < 8 && pieces[end] == 0) end++;
            if (end - i > bestLength) {
                compress = i;
                bestLength = end - i;
            }
            i = end;
        }

        StringBuilder out = new StringBuilder();
        boolean skippingZeros = false;
        for (int i = 0; i < 8; i++) {
            if (skippingZeros && pieces[i] == 0) continue;
            skippingZeros = false;
            if (i == compress) {
                out.append(i == 0 ? "::" : ":");
                skippingZeros = true;
                continue;
            }
            out.append(Integer.toHexString(pieces[i]));
            if (i != 7) out.append(':');
        }
        return out.toString();
    }

    /** Trims ordinary and Unicode spaces, such as the no-break space a copy from a chat app adds. */
    private static String stripEdges(String text) {
        int start = 0;
        int end = text.length();
        while (start < end && isEdgeSpace(text.charAt(start))) start++;
        while (end > start && isEdgeSpace(text.charAt(end - 1))) end--;
        return text.substring(start, end);
    }

    private static boolean isEdgeSpace(char c) {
        return c <= ' ' || Character.isWhitespace(c) || Character.isSpaceChar(c);
    }
}
