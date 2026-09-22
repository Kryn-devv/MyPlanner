package app.nova.planner;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Function;
import org.junit.After;
import org.junit.Assume;
import org.junit.Test;

/**
 * Runs the probe against real sockets on 127.0.0.1: an HTTP server that answers like NOVA (or
 * like something else), a port with nothing listening, and a server that never replies.
 *
 * <p>The HTTP side is a few lines over a ServerSocket rather than the JDK's HttpServer, because
 * unit tests compile against android.jar, which does not include com.sun.net.httpserver.
 */
public class ServerProbeTest {

    private static final String NOVA_LOGIN_HTML = "<!DOCTYPE html><html><head>"
            + "<link rel=\"stylesheet\" href=\"/_next/static/css/app.css\"/></head>"
            + "<body><h1>Sign in</h1></body></html>";

    private ServerSocket server;
    private ServerSocket silentServer;
    private final List<Socket> clients = new ArrayList<>();

    @After
    public void tearDown() throws IOException {
        if (server != null) server.close();
        if (silentServer != null) silentServer.close();
        for (Socket client : clients) client.close();
    }

    /** One canned HTTP response. */
    private static final class Reply {
        final int status;
        final String poweredBy;
        final String location;
        final String body;

        Reply(int status, String poweredBy, String location, String body) {
            this.status = status;
            this.poweredBy = poweredBy;
            this.location = location;
            this.body = body;
        }
    }

    /**
     * Starts a server that answers each request with whatever {@code replies} gives for its path,
     * and adds every requested path to {@code seenPaths} when that is not null.
     */
    private String serve(Function<String, Reply> replies, List<String> seenPaths) throws IOException {
        server = new ServerSocket(0, 8, InetAddress.getLoopbackAddress());
        final ServerSocket listening = server;
        Thread acceptor = new Thread(() -> {
            while (!listening.isClosed()) {
                try (Socket socket = listening.accept()) {
                    BufferedReader in = new BufferedReader(
                            new InputStreamReader(socket.getInputStream(), StandardCharsets.ISO_8859_1));
                    String requestLine = in.readLine();
                    if (requestLine == null) continue;
                    String path = requestLine.split(" ")[1];
                    if (seenPaths != null) seenPaths.add(path);
                    String header;
                    while ((header = in.readLine()) != null && !header.isEmpty()) {
                        // Headers are read only to get past them.
                    }

                    Reply reply = replies.apply(path);
                    byte[] bytes = reply.body == null ? new byte[0] : reply.body.getBytes(StandardCharsets.UTF_8);
                    StringBuilder head = new StringBuilder("HTTP/1.1 ").append(reply.status).append(" Test\r\n")
                            .append("Content-Length: ").append(bytes.length).append("\r\n")
                            .append("Content-Type: text/html; charset=utf-8\r\n")
                            .append("Connection: close\r\n");
                    if (reply.poweredBy != null) head.append("X-Powered-By: ").append(reply.poweredBy).append("\r\n");
                    if (reply.location != null) head.append("Location: ").append(reply.location).append("\r\n");
                    head.append("\r\n");

                    OutputStream out = socket.getOutputStream();
                    out.write(head.toString().getBytes(StandardCharsets.ISO_8859_1));
                    out.write(bytes);
                    out.flush();
                } catch (IOException e) {
                    // Closed by tearDown, or the client hung up early; either way, stop or move on.
                }
            }
        }, "test-http");
        acceptor.setDaemon(true);
        acceptor.start();
        return "http://127.0.0.1:" + server.getLocalPort();
    }

    /** Starts a server that answers every request the same way. */
    private String serve(int status, String poweredBy, String location, String body, List<String> seenPaths)
            throws IOException {
        Reply reply = new Reply(status, poweredBy, location, body);
        return serve(path -> reply, seenPaths);
    }

    private static ServerProbe.Outcome probe(String base) {
        return ServerProbe.check(base, 2000).outcome;
    }

    private static int closedPort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            return socket.getLocalPort();
        }
    }

    @Test
    public void novaSignInPageIsAccepted() throws IOException {
        List<String> paths = new CopyOnWriteArrayList<>();
        String base = serve(200, null, null, NOVA_LOGIN_HTML, paths);
        ServerProbe.Result result = ServerProbe.check(base, 2000);
        assertEquals(ServerProbe.Outcome.OK, result.outcome);
        assertEquals(200, result.httpStatus);
        assertEquals(base, result.baseUrl);
        assertEquals(Arrays.asList("/login"), paths);
    }

    @Test
    public void nextJsHeaderAloneIsEnough() throws IOException {
        assertEquals(ServerProbe.Outcome.OK, probe(serve(200, "Next.js", null, "<html></html>", null)));
    }

    @Test
    public void markerDeepInALargePageIsFound() throws IOException {
        StringBuilder page = new StringBuilder("<html><head>");
        for (int i = 0; i < 5000; i++) page.append("<meta name=\"x").append(i).append("\" content=\"padding\"/>");
        page.append("<script src=\"/_next/static/chunks/main.js\"></script></head></html>");
        assertEquals(ServerProbe.Outcome.OK, probe(serve(200, null, null, page.toString(), null)));
    }

    @Test
    public void someOtherWebServerIsNotNova() throws IOException {
        assertEquals(ServerProbe.Outcome.NOT_NOVA,
                probe(serve(200, "Express", null, "<html><body>Router admin</body></html>", null)));
    }

    @Test
    public void missingLoginPageIsNotNova() throws IOException {
        assertEquals(ServerProbe.Outcome.NOT_NOVA, probe(serve(404, null, null, "Not found", null)));
    }

    @Test
    public void serverErrorIsReportedAsSuch() throws IOException {
        ServerProbe.Result result = ServerProbe.check(serve(500, "Next.js", null, "boom", null), 2000);
        assertEquals(ServerProbe.Outcome.SERVER_ERROR, result.outcome);
        assertEquals(500, result.httpStatus);
    }

    // -- redirects -------------------------------------------------------------------------------

    @Test
    public void sameOriginRedirectIsFollowedToTheSignInPage() throws IOException {
        List<String> paths = new CopyOnWriteArrayList<>();
        String base = serve(path -> path.equals("/login")
                ? new Reply(308, null, "/login/", null)
                : new Reply(200, null, null, NOVA_LOGIN_HTML), paths);
        ServerProbe.Result result = ServerProbe.check(base, 2000);
        assertEquals(ServerProbe.Outcome.OK, result.outcome);
        assertEquals(base, result.baseUrl);
        assertEquals(Arrays.asList("/login", "/login/"), paths);
    }

    @Test
    public void sameOriginRedirectMustStillLeadToNova() throws IOException {
        // A router that sends every path to its own admin page answers the redirect's target,
        // but not with a Next.js page.
        String base = serve(path -> path.equals("/login")
                ? new Reply(302, null, "/cgi-bin/luci", null)
                : new Reply(200, null, null, "<html><body>Router admin</body></html>"), null);
        assertEquals(ServerProbe.Outcome.NOT_NOVA, probe(base));
    }

    @Test
    public void redirectToAnotherHostIsReportedAndNotFollowed() throws IOException {
        List<String> paths = new CopyOnWriteArrayList<>();
        String base = serve(302, null, "http://192.168.1.1/cgi-bin/luci", null, paths);
        ServerProbe.Result result = ServerProbe.check(base, 2000);
        assertEquals(ServerProbe.Outcome.FORWARDS_ELSEWHERE, result.outcome);
        assertEquals("http://192.168.1.1", result.redirectTarget);
        assertEquals(base, result.baseUrl);
        // Following it would have meant a request to the router, not a second one here.
        assertEquals(Arrays.asList("/login"), paths);
    }

    @Test
    public void httpForwardingToHttpsOnTheSameHostIsCheckedAsHttps() throws IOException {
        // Nothing listens on the https port, so the upgraded check fails, but it fails as the
        // https address: proof that the https origin, not the typed http one, was checked.
        int httpsPort = closedPort();
        String base = serve(301, null, "https://127.0.0.1:" + httpsPort + "/login", null, null);
        ServerProbe.Result result = ServerProbe.check(base, 2000);
        assertEquals(ServerProbe.Outcome.UNREACHABLE, result.outcome);
        assertEquals("https://127.0.0.1:" + httpsPort, result.baseUrl);
    }

    @Test
    public void redirectLoopIsNotNova() throws IOException {
        List<String> paths = new CopyOnWriteArrayList<>();
        String base = serve(307, null, "/login", null, paths);
        assertEquals(ServerProbe.Outcome.NOT_NOVA, probe(base));
        assertEquals(ServerProbe.MAX_REDIRECTS + 1, paths.size());
    }

    @Test
    public void redirectWithoutLocationIsNotNova() throws IOException {
        assertEquals(ServerProbe.Outcome.NOT_NOVA, probe(serve(302, null, null, null, null)));
    }

    @Test
    public void redirectDecisionsFollowTheSavedOrigin() {
        assertRedirect(ServerProbe.RedirectKind.FOLLOW, "http://192.168.1.5:3000/login/",
                "http://192.168.1.5:3000", "http://192.168.1.5:3000/login", "/login/");
        assertRedirect(ServerProbe.RedirectKind.FOLLOW, "http://192.168.1.5:3000/en/login",
                "http://192.168.1.5:3000", "http://192.168.1.5:3000/login", "http://192.168.1.5:3000/en/login");
        // The default port, written out or not, is the same origin.
        assertRedirect(ServerProbe.RedirectKind.FOLLOW, "https://nova.example.com:443/login/",
                "https://nova.example.com", "https://nova.example.com/login", "https://nova.example.com:443/login/");

        // What nearly every host does to plain http, whatever the path it sends to.
        assertRedirect(ServerProbe.RedirectKind.UPGRADE, "https://nova.example.com",
                "http://nova.example.com", "http://nova.example.com/login", "https://nova.example.com/login");
        assertRedirect(ServerProbe.RedirectKind.UPGRADE, "https://nova.example.com:8443",
                "http://nova.example.com:8080", "http://nova.example.com:8080/login", "https://nova.example.com:8443/");

        assertRedirect(ServerProbe.RedirectKind.ELSEWHERE, "https://www.example.com",
                "https://example.com", "https://example.com/login", "https://www.example.com/login");
        assertRedirect(ServerProbe.RedirectKind.ELSEWHERE, "http://192.168.1.1",
                "http://192.168.1.5:3000", "http://192.168.1.5:3000/login", "http://192.168.1.1/cgi-bin/luci");
        assertRedirect(ServerProbe.RedirectKind.ELSEWHERE, "http://portal.example",
                "http://192.168.1.5:3000", "http://192.168.1.5:3000/login", "//portal.example/login");
        // A downgrade is never taken for an upgrade, and neither is another port over http.
        assertRedirect(ServerProbe.RedirectKind.ELSEWHERE, "http://nova.example.com",
                "https://nova.example.com", "https://nova.example.com/login", "http://nova.example.com/login");
        assertRedirect(ServerProbe.RedirectKind.ELSEWHERE, "http://192.168.1.5:3001",
                "http://192.168.1.5:3000", "http://192.168.1.5:3000/login", "http://192.168.1.5:3001/login");

        assertRedirect(ServerProbe.RedirectKind.INVALID, null,
                "http://192.168.1.5:3000", "http://192.168.1.5:3000/login", null);
        assertRedirect(ServerProbe.RedirectKind.INVALID, null,
                "http://192.168.1.5:3000", "http://192.168.1.5:3000/login", " ");
        assertRedirect(ServerProbe.RedirectKind.INVALID, null,
                "http://192.168.1.5:3000", "http://192.168.1.5:3000/login", "http://bad host/");
        assertRedirect(ServerProbe.RedirectKind.INVALID, null,
                "http://192.168.1.5:3000", "http://192.168.1.5:3000/login", "ftp://192.168.1.5/");
    }

    private static void assertRedirect(ServerProbe.RedirectKind kind, String target, String base, String from,
            String location) {
        ServerProbe.Redirect redirect = ServerProbe.redirect(base, from, location);
        assertEquals("kind for " + location, kind, redirect.kind);
        if (target == null) {
            assertNull(redirect.target);
        } else {
            assertEquals("target for " + location, target, redirect.target);
        }
    }

    // -- failures before any page ----------------------------------------------------------------

    @Test
    public void closedPortIsUnreachable() throws IOException {
        assertEquals(ServerProbe.Outcome.UNREACHABLE, probe("http://127.0.0.1:" + closedPort()));
    }

    @Test
    public void serverThatAcceptsButNeverAnswersIsSlowNotTimedOut() throws Exception {
        silentServer = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
        Thread acceptor = new Thread(() -> {
            try (Socket ignored = silentServer.accept()) {
                Thread.sleep(5000);
            } catch (IOException | InterruptedException e) {
                // Closed by tearDown; nothing to do.
            }
        });
        acceptor.setDaemon(true);
        acceptor.start();

        long started = System.nanoTime();
        ServerProbe.Result result = ServerProbe.check("http://127.0.0.1:" + silentServer.getLocalPort(), 300);
        long elapsedMs = (System.nanoTime() - started) / 1_000_000;

        // The connection was accepted, so this is a server still getting ready (a dev server
        // compiling its first page), not a firewall or a sleeping PC.
        assertEquals(ServerProbe.Outcome.SLOW_TO_ANSWER, result.outcome);
        assertTrue("the timeout, not the server, should end the wait", elapsedMs < 4000);
    }

    @Test
    public void connectionThatIsNeverAcceptedTimesOut() throws Exception {
        // Linux drops new connection attempts once a listening socket's queue is full, which is
        // exactly what a firewall silently dropping packets looks like to the phone. Windows and
        // macOS refuse them instead, so there the case cannot be staged and the test is skipped.
        Assume.assumeTrue(System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("linux"));
        silentServer = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
        InetSocketAddress address = new InetSocketAddress(InetAddress.getLoopbackAddress(), silentServer.getLocalPort());
        boolean full = false;
        for (int i = 0; i < 16 && !full; i++) {
            Socket client = new Socket();
            clients.add(client);
            try {
                client.connect(address, 300);
            } catch (SocketTimeoutException e) {
                full = true;
            }
        }
        Assume.assumeTrue("the accept queue never filled up", full);

        ServerProbe.Result result = ServerProbe.check("http://127.0.0.1:" + silentServer.getLocalPort(), 300);
        assertEquals(ServerProbe.Outcome.TIMED_OUT, result.outcome);
    }

    @Test
    public void nonHttpServiceIsNotNova() throws Exception {
        silentServer = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
        Thread acceptor = new Thread(() -> {
            try (Socket socket = silentServer.accept()) {
                socket.getOutputStream().write("SSH-2.0-OpenSSH_9.6\r\n".getBytes(StandardCharsets.US_ASCII));
                socket.getOutputStream().flush();
                Thread.sleep(1000);
            } catch (IOException | InterruptedException e) {
                // Closed by tearDown; nothing to do.
            }
        });
        acceptor.setDaemon(true);
        acceptor.start();

        ServerProbe.Outcome outcome = probe("http://127.0.0.1:" + silentServer.getLocalPort());
        // The JVM's HttpURLConnection falls back to HTTP/0.9 for a response with no status line
        // and reports it as status -1; Android's stack throws ProtocolException instead. Both
        // must land on NOT_NOVA rather than looking like a working server.
        assertEquals(ServerProbe.Outcome.NOT_NOVA, outcome);
    }

    // -- the pure classification ----------------------------------------------------------------

    @Test
    public void classifyCoversEveryStatusClass() {
        assertEquals(ServerProbe.Outcome.OK, ServerProbe.classify(200, null, "<script src=\"/_next/x\">"));
        assertEquals(ServerProbe.Outcome.OK, ServerProbe.classify(204, "Next.js", null));
        assertEquals(ServerProbe.Outcome.OK, ServerProbe.classify(200, "next.js 16", ""));
        assertEquals(ServerProbe.Outcome.NOT_NOVA, ServerProbe.classify(200, null, "<html></html>"));
        assertEquals(ServerProbe.Outcome.NOT_NOVA, ServerProbe.classify(200, null, null));
        // check() resolves redirects before classifying, so a 3xx here went nowhere usable.
        assertEquals(ServerProbe.Outcome.NOT_NOVA, ServerProbe.classify(301, null, null));
        assertEquals(ServerProbe.Outcome.NOT_NOVA, ServerProbe.classify(304, "Next.js", null));
        assertEquals(ServerProbe.Outcome.NOT_NOVA, ServerProbe.classify(401, null, null));
        assertEquals(ServerProbe.Outcome.NOT_NOVA, ServerProbe.classify(404, "Next.js", null));
        assertEquals(ServerProbe.Outcome.SERVER_ERROR, ServerProbe.classify(502, null, null));
        assertEquals(ServerProbe.Outcome.NOT_NOVA, ServerProbe.classify(-1, null, null));
        assertEquals(ServerProbe.Outcome.NOT_NOVA, ServerProbe.classify(100, null, null));
    }
}
