package app.nova.planner;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.junit.Test;

public class ServerAddressTest {

    private static String normalize(String input) {
        try {
            return ServerAddress.normalize(input);
        } catch (ServerAddress.InvalidException e) {
            throw new AssertionError("expected \"" + input + "\" to be accepted, got " + e.problem);
        }
    }

    private static void assertRejected(String input, ServerAddress.Problem expected) {
        try {
            String result = ServerAddress.normalize(input);
            fail("expected \"" + input + "\" to be rejected, got " + result);
        } catch (ServerAddress.InvalidException e) {
            assertEquals("problem for \"" + input + "\"", expected, e.problem);
        }
    }

    // -- normalization: what people actually type ---------------------------------------------

    @Test
    public void bareIpAndPortGetsHttp() {
        assertEquals("http://192.168.1.5:3000", normalize("192.168.1.5:3000"));
    }

    @Test
    public void bareIpWithoutPortGetsHttpAndNoPort() {
        assertEquals("http://192.168.1.5", normalize("192.168.1.5"));
    }

    @Test
    public void explicitHttpIsKept() {
        assertEquals("http://192.168.1.5:3000", normalize("http://192.168.1.5:3000"));
    }

    @Test
    public void httpsIsKept() {
        assertEquals("https://nova.example.com", normalize("https://nova.example.com"));
        assertEquals("https://nova.example.com:8443", normalize("https://nova.example.com:8443"));
    }

    @Test
    public void trailingSlashesAreStripped() {
        assertEquals("http://192.168.1.5:3000", normalize("http://192.168.1.5:3000/"));
        assertEquals("http://192.168.1.5:3000", normalize("http://192.168.1.5:3000///"));
        assertEquals("http://192.168.1.5:3000", normalize("192.168.1.5:3000/"));
    }

    @Test
    public void pathQueryAndFragmentAreStripped() {
        assertEquals("http://192.168.1.5:3000", normalize("http://192.168.1.5:3000/app/today"));
        assertEquals("http://192.168.1.5:3000", normalize("192.168.1.5:3000/login?next=/app#top"));
        assertEquals("http://192.168.1.5:3000", normalize("192.168.1.5:3000?x=1"));
        assertEquals("http://192.168.1.5:3000", normalize("192.168.1.5:3000#frag"));
    }

    @Test
    public void surroundingWhitespaceIsTrimmed() {
        assertEquals("http://192.168.1.5:3000", normalize("  192.168.1.5:3000 \n"));
        assertEquals("http://192.168.1.5:3000", normalize("\t http://192.168.1.5:3000/ "));
        // A no-break space, as pasted from a chat app.
        assertEquals("http://192.168.1.5:3000", normalize(" 192.168.1.5:3000 "));
    }

    @Test
    public void uppercaseSchemeAndHostAreLowercased() {
        assertEquals("http://192.168.1.5:3000", normalize("HTTP://192.168.1.5:3000"));
        assertEquals("https://nova.example.com", normalize("HTTPS://NOVA.Example.COM/"));
        assertEquals("http://my-pc.local:3000", normalize("My-PC.local:3000"));
    }

    @Test
    public void defaultPortsAreDropped() {
        assertEquals("http://192.168.1.5", normalize("http://192.168.1.5:80"));
        assertEquals("https://nova.example.com", normalize("https://nova.example.com:443"));
        // ...but only the scheme's own default.
        assertEquals("http://192.168.1.5:443", normalize("http://192.168.1.5:443"));
        assertEquals("https://nova.example.com:80", normalize("https://nova.example.com:80"));
    }

    @Test
    public void leadingZerosInAPortAreHarmless() {
        assertEquals("http://192.168.1.5:3000", normalize("192.168.1.5:03000"));
    }

    @Test
    public void hostnamesAreAccepted() {
        assertEquals("http://localhost:3000", normalize("localhost:3000"));
        assertEquals("http://nova-pc:3000", normalize("nova-pc:3000"));
        assertEquals("http://desktop-7h2k.local:3000", normalize("desktop-7h2k.local:3000/"));
    }

    @Test
    public void ipv6LiteralsInBracketsAreAcceptedAndCanonicalized() {
        assertEquals("http://[fd00::5]:3000", normalize("[fd00::5]:3000"));
        assertEquals("http://[fd00::5]:3000", normalize("http://[FD00:0:0:0:0:0:0:5]:3000/app"));
        assertEquals("http://[::1]:3000", normalize("http://[0:0:0:0:0:0:0:1]:3000"));
        assertEquals("http://[2001:db8::1:0:0:1]", normalize("http://[2001:db8:0:0:1:0:0:1]"));
        assertEquals("http://[::ffff:c0a8:105]:3000", normalize("[::ffff:192.168.1.5]:3000"));
        assertEquals("http://[1:2:3:4:5:6:7:8]", normalize("[1:2:3:4:5:6:7:8]"));
        assertEquals("http://[fd00::]", normalize("[fd00::]"));
        assertEquals("http://[::]", normalize("[::]"));
    }

    @Test
    public void ipv6WithoutBracketsGetsItsOwnHint() {
        assertRejected("fe80::1", ServerAddress.Problem.IPV6_NEEDS_BRACKETS);
        assertRejected("2001:db8::1", ServerAddress.Problem.IPV6_NEEDS_BRACKETS);
        assertRejected("::1", ServerAddress.Problem.IPV6_NEEDS_BRACKETS);
        assertRejected("http://fd00::5:3000", ServerAddress.Problem.IPV6_NEEDS_BRACKETS);
    }

    @Test
    public void malformedIpv6IsRejected() {
        assertRejected("[fd00::5", ServerAddress.Problem.INVALID);
        assertRejected("[1::2::3]", ServerAddress.Problem.INVALID);
        assertRejected("[12345::1]", ServerAddress.Problem.INVALID);
        assertRejected("[1:2:3:4:5:6:7:8:9]", ServerAddress.Problem.INVALID);
        assertRejected("[1:2:3:4:5:6:7]", ServerAddress.Problem.INVALID);
        assertRejected("[fe80::1%wlan0]:3000", ServerAddress.Problem.INVALID);
        assertRejected("[fd00::5]3000", ServerAddress.Problem.INVALID);
        assertRejected("[]:3000", ServerAddress.Problem.INVALID);
    }

    // -- normalization: what must be refused ----------------------------------------------------

    @Test
    public void emptyInputIsRejected() {
        assertRejected("", ServerAddress.Problem.EMPTY);
        assertRejected("   ", ServerAddress.Problem.EMPTY);
        assertRejected(null, ServerAddress.Problem.EMPTY);
    }

    @Test
    public void garbageIsRejected() {
        assertRejected("hello world", ServerAddress.Problem.INVALID);
        assertRejected("http://", ServerAddress.Problem.INVALID);
        assertRejected("://192.168.1.5", ServerAddress.Problem.INVALID);
        assertRejected("http:///app", ServerAddress.Problem.INVALID);
        assertRejected("http://:3000", ServerAddress.Problem.INVALID);
        assertRejected("!!!", ServerAddress.Problem.INVALID);
        assertRejected("my_pc:3000", ServerAddress.Problem.INVALID);
        assertRejected("-nova:3000", ServerAddress.Problem.INVALID);
        assertRejected("nova..local", ServerAddress.Problem.INVALID);
        assertRejected("nova.local.", ServerAddress.Problem.INVALID);
        assertRejected("növa.local", ServerAddress.Problem.INVALID);
        assertRejected("http:/192.168.1.5:3000", ServerAddress.Problem.INVALID);
        assertRejected("http:192.168.1.5", ServerAddress.Problem.INVALID);
    }

    @Test
    public void schemeMissingItsColonIsRejectedNotReadAsAHost() {
        // Without this rule each of these became "http://http" or "http://https".
        assertRejected("http//192.168.1.5:3000", ServerAddress.Problem.INVALID);
        assertRejected("HTTP//192.168.1.5:3000", ServerAddress.Problem.INVALID);
        assertRejected("http//192.168.1.5", ServerAddress.Problem.INVALID);
        assertRejected("https//nova.example.com", ServerAddress.Problem.INVALID);
        assertRejected("http\\\\192.168.1.5:3000", ServerAddress.Problem.INVALID);
        assertRejected("http:3000", ServerAddress.Problem.INVALID);
        assertRejected("https", ServerAddress.Problem.INVALID);
        // Hosts that merely start with the letters are ordinary names.
        assertEquals("http://https-server:3000", normalize("https-server:3000"));
        assertEquals("http://http.local:3000", normalize("http.local:3000"));
    }

    @Test
    public void badPortsAreRejected() {
        assertRejected("192.168.1.5:", ServerAddress.Problem.INVALID);
        assertRejected("localhost:", ServerAddress.Problem.INVALID);
        assertRejected("192.168.1.5:0", ServerAddress.Problem.INVALID);
        assertRejected("192.168.1.5:65536", ServerAddress.Problem.INVALID);
        assertRejected("192.168.1.5:3000x", ServerAddress.Problem.INVALID);
        assertRejected("192.168.1.5:1234567", ServerAddress.Problem.INVALID);
    }

    @Test
    public void ambiguousIpv4IsRejected() {
        assertRejected("192.168.1", ServerAddress.Problem.INVALID);
        assertRejected("192.168.1.256", ServerAddress.Problem.INVALID);
        assertRejected("192.168.1.5.6", ServerAddress.Problem.INVALID);
        // A browser would read these as octal, hex or shorthand and connect somewhere else.
        assertRejected("192.168.01.5", ServerAddress.Problem.INVALID);
        assertRejected("0x7f.0.0.1", ServerAddress.Problem.INVALID);
        assertRejected("10.1", ServerAddress.Problem.INVALID);
        assertRejected("3000", ServerAddress.Problem.INVALID);
    }

    @Test
    public void credentialsInTheAddressAreRejected() {
        assertRejected("http://user:secret@192.168.1.5:3000", ServerAddress.Problem.INVALID);
        assertRejected("admin@192.168.1.5", ServerAddress.Problem.INVALID);
    }

    @Test
    public void spacesInsideAreRejected() {
        assertRejected("192.168.1. 5:3000", ServerAddress.Problem.INVALID);
        assertRejected("http://192.168.1.5:3000/my app", ServerAddress.Problem.INVALID);
    }

    @Test
    public void nonHttpSchemesAreRejected() {
        assertRejected("ftp://192.168.1.5", ServerAddress.Problem.UNSUPPORTED_SCHEME);
        assertRejected("file:///sdcard/index.html", ServerAddress.Problem.UNSUPPORTED_SCHEME);
        assertRejected("content://app.nova.planner/x", ServerAddress.Problem.UNSUPPORTED_SCHEME);
        assertRejected("ws://192.168.1.5:3000", ServerAddress.Problem.UNSUPPORTED_SCHEME);
        assertRejected("javascript:alert(1)", ServerAddress.Problem.UNSUPPORTED_SCHEME);
        assertRejected("mailto:me@example.com", ServerAddress.Problem.UNSUPPORTED_SCHEME);
        assertRejected("intent://scan/#Intent;scheme=zxing;end", ServerAddress.Problem.UNSUPPORTED_SCHEME);
        assertRejected("data:text/html,hi", ServerAddress.Problem.UNSUPPORTED_SCHEME);
        assertRejected("about:blank", ServerAddress.Problem.UNSUPPORTED_SCHEME);
        // Digits after the colon would otherwise pass for a host and port.
        assertRejected("tel:5551234", ServerAddress.Problem.UNSUPPORTED_SCHEME);
        assertRejected("SMS:5551234", ServerAddress.Problem.UNSUPPORTED_SCHEME);
    }

    @Test
    public void normalizingIsIdempotent() {
        String[] inputs = {"192.168.1.5:3000", "HTTPS://Nova.Example.com:443/x", "[FD00::0:5]:3000", "localhost"};
        for (String input : inputs) {
            String once = normalize(input);
            assertEquals(once, normalize(once));
        }
    }

    // -- origins ---------------------------------------------------------------------------------

    @Test
    public void sameOriginNeedsSchemeHostAndPortToMatch() {
        String base = "http://192.168.1.5:3000";
        assertTrue(ServerAddress.isSameOrigin(base, "http://192.168.1.5:3000/app"));
        assertTrue(ServerAddress.isSameOrigin(base, "http://192.168.1.5:3000"));
        assertTrue(ServerAddress.isSameOrigin(base, "http://192.168.1.5:3000/login?next=%2Fapp#x"));

        assertFalse("scheme", ServerAddress.isSameOrigin(base, "https://192.168.1.5:3000/app"));
        assertFalse("host", ServerAddress.isSameOrigin(base, "http://192.168.1.6:3000/app"));
        assertFalse("port", ServerAddress.isSameOrigin(base, "http://192.168.1.5:3001/app"));
        assertFalse("no port", ServerAddress.isSameOrigin(base, "http://192.168.1.5/app"));
    }

    @Test
    public void defaultPortsCountAsTheSameOrigin() {
        assertTrue(ServerAddress.isSameOrigin("http://192.168.1.5", "http://192.168.1.5:80/app"));
        assertTrue(ServerAddress.isSameOrigin("http://192.168.1.5:80", "http://192.168.1.5/app"));
        assertTrue(ServerAddress.isSameOrigin("https://nova.example.com", "https://nova.example.com:443/"));
        assertFalse(ServerAddress.isSameOrigin("http://192.168.1.5", "http://192.168.1.5:443/"));
        assertFalse(ServerAddress.isSameOrigin("https://nova.example.com", "https://nova.example.com:80/"));
    }

    @Test
    public void hostComparisonIgnoresCase() {
        assertTrue(ServerAddress.isSameOrigin("https://nova.example.com", "HTTPS://NOVA.example.COM/app"));
    }

    @Test
    public void ipv6OriginsCompareCanonically() {
        assertTrue(ServerAddress.isSameOrigin("http://[fd00::5]:3000", "http://[fd00:0:0:0:0:0:0:5]:3000/app"));
        assertTrue(ServerAddress.isSameOrigin("http://[fd00::5]:3000", "http://[FD00::5]:3000/"));
        assertFalse(ServerAddress.isSameOrigin("http://[fd00::5]:3000", "http://[fd00::6]:3000/"));
    }

    @Test
    public void lookalikeHostsAreForeign() {
        String base = "http://192.168.1.5:3000";
        // Credentials syntax: the real host is after the @.
        assertFalse(ServerAddress.isSameOrigin(base, "http://192.168.1.5:3000@evil.example/"));
        // Browsers treat a backslash as a slash, which ends the host.
        assertFalse(ServerAddress.isSameOrigin(base, "http://evil.example\\@192.168.1.5:3000/"));
        // A prefix or suffix of the host is a different host.
        assertFalse(ServerAddress.isSameOrigin("http://nova.local:3000", "http://nova.local.evil.example:3000/"));
        assertFalse(ServerAddress.isSameOrigin("http://nova.local:3000", "http://evilnova.local:3000/"));
    }

    @Test
    public void credentialsDoNotChangeTheOrigin() {
        assertTrue(ServerAddress.isSameOrigin("http://192.168.1.5:3000", "http://user:pw@192.168.1.5:3000/app"));
    }

    @Test
    public void nonWebAndUnparseableUrlsAreNeverTheServer() {
        String base = "http://192.168.1.5:3000";
        assertFalse(ServerAddress.isSameOrigin(base, "javascript:alert(1)"));
        assertFalse(ServerAddress.isSameOrigin(base, "file:///192.168.1.5:3000"));
        assertFalse(ServerAddress.isSameOrigin(base, "ws://192.168.1.5:3000/"));
        assertFalse(ServerAddress.isSameOrigin(base, "http://"));
        assertFalse(ServerAddress.isSameOrigin(base, null));
        assertFalse(ServerAddress.isSameOrigin(null, "http://192.168.1.5:3000/"));
        assertFalse(ServerAddress.isSameOrigin("garbage", "garbage"));
        assertNull(ServerAddress.origin("mailto:me@example.com"));
    }

    @Test
    public void originExposesItsParts() {
        ServerAddress.Origin origin = ServerAddress.origin("https://Nova.Example.com/app");
        assertEquals("https", origin.scheme);
        assertEquals("nova.example.com", origin.host);
        assertEquals(443, origin.port);
        assertEquals("https://nova.example.com", origin.toBaseUrl());
    }

    @Test
    public void defaultHttpPortHintAppliesOnlyToPlainHttpOn80() {
        assertTrue(ServerAddress.usesDefaultHttpPort("http://192.168.1.5"));
        assertFalse(ServerAddress.usesDefaultHttpPort("http://192.168.1.5:3000"));
        assertFalse(ServerAddress.usesDefaultHttpPort("https://nova.example.com"));
    }

    @Test
    public void loopbackAddressesAreRecognized() {
        assertTrue(ServerAddress.isLoopback("http://localhost:3000"));
        assertTrue(ServerAddress.isLoopback("http://nova.localhost:3000"));
        assertTrue(ServerAddress.isLoopback("http://127.0.0.1:3000"));
        assertTrue(ServerAddress.isLoopback("http://127.1.2.3"));
        assertTrue(ServerAddress.isLoopback("http://0.0.0.0:3000"));
        assertTrue(ServerAddress.isLoopback("http://[::1]:3000"));
        assertTrue(ServerAddress.isLoopback("http://[::]:3000"));
        assertTrue(ServerAddress.isLoopback("http://[::ffff:7f00:1]:3000"));
        assertTrue(ServerAddress.isLoopback("http://[::ffff:0:0]:3000"));
        // What the connect screen actually has in hand is normalize()'s output.
        assertTrue(ServerAddress.isLoopback(normalize("LOCALHOST:3000")));
        assertTrue(ServerAddress.isLoopback(normalize("[0:0:0:0:0:0:0:1]:3000")));
        assertTrue(ServerAddress.isLoopback(normalize("[::ffff:127.0.0.1]:3000")));

        assertFalse(ServerAddress.isLoopback("http://192.168.1.5:3000"));
        assertFalse(ServerAddress.isLoopback("http://10.0.0.1:3000"));
        assertFalse(ServerAddress.isLoopback("http://128.0.0.1:3000"));
        assertFalse(ServerAddress.isLoopback("http://0.0.0.1:3000"));
        assertFalse(ServerAddress.isLoopback("http://[fd00::1]:3000"));
        assertFalse(ServerAddress.isLoopback("http://[::2]:3000"));
        assertFalse(ServerAddress.isLoopback("http://[::ffff:c0a8:105]:3000"));
        assertFalse(ServerAddress.isLoopback("http://mylocalhost:3000"));
        assertFalse(ServerAddress.isLoopback("http://localhost.example.com"));
        assertFalse(ServerAddress.isLoopback("garbage"));
        assertFalse(ServerAddress.isLoopback(null));
    }

    // -- the IPv6 serializer matches the URL standard -------------------------------------------

    @Test
    public void ipv6SerializationCompressesTheFirstLongestZeroRun() {
        assertEquals("1:0:0:2::3", ServerAddress.formatIpv6(new int[] {1, 0, 0, 2, 0, 0, 0, 3}));
        assertEquals("1::2:0:0:3", ServerAddress.formatIpv6(new int[] {1, 0, 0, 0, 2, 0, 0, 3}));
        assertEquals("1::2:0:0:0", ServerAddress.formatIpv6(new int[] {1, 0, 0, 0, 2, 0, 0, 0}));
        assertEquals("1:0:2:3:4:5:6:7", ServerAddress.formatIpv6(new int[] {1, 0, 2, 3, 4, 5, 6, 7}));
        assertEquals("::", ServerAddress.formatIpv6(new int[8]));
        assertEquals("1::", ServerAddress.formatIpv6(new int[] {1, 0, 0, 0, 0, 0, 0, 0}));
    }
}
