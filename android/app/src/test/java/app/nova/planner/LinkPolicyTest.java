package app.nova.planner;

import static app.nova.planner.LinkPolicy.Decision.BLOCK;
import static app.nova.planner.LinkPolicy.Decision.OPEN_OUTSIDE;
import static app.nova.planner.LinkPolicy.Decision.STAY;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class LinkPolicyTest {

    private static final String BASE = "http://192.168.1.5:3000";

    @Test
    public void pagesOnTheServerStayInTheApp() {
        assertEquals(STAY, LinkPolicy.decide(BASE, "http://192.168.1.5:3000/app"));
        assertEquals(STAY, LinkPolicy.decide(BASE, "http://192.168.1.5:3000/login?next=%2Fapp"));
        assertEquals(STAY, LinkPolicy.decide(BASE, "http://192.168.1.5:3000/"));
    }

    @Test
    public void otherWebsitesOpenOutside() {
        assertEquals(OPEN_OUTSIDE, LinkPolicy.decide(BASE, "https://example.com/help"));
        assertEquals(OPEN_OUTSIDE, LinkPolicy.decide(BASE, "http://192.168.1.5:8080/"));
        assertEquals(OPEN_OUTSIDE, LinkPolicy.decide(BASE, "https://192.168.1.5:3000/app"));
        assertEquals(OPEN_OUTSIDE, LinkPolicy.decide(BASE, "http://192.168.1.5:3000@evil.example/"));
        // Not parseable as a server address, but still a web link a browser can judge.
        assertEquals(OPEN_OUTSIDE, LinkPolicy.decide(BASE, "https://under_score.example.com/"));
    }

    @Test
    public void mailAndPhoneLinksOpenOutside() {
        assertEquals(OPEN_OUTSIDE, LinkPolicy.decide(BASE, "mailto:someone@example.com"));
        assertEquals(OPEN_OUTSIDE, LinkPolicy.decide(BASE, "tel:+15551234"));
        assertEquals(OPEN_OUTSIDE, LinkPolicy.decide(BASE, "MAILTO:someone@example.com"));
    }

    @Test
    public void everythingElseIsBlocked() {
        assertEquals(BLOCK, LinkPolicy.decide(BASE, "intent://scan/#Intent;scheme=zxing;package=x;end"));
        assertEquals(BLOCK, LinkPolicy.decide(BASE, "javascript:alert(1)"));
        assertEquals(BLOCK, LinkPolicy.decide(BASE, "file:///data/data/app.nova.planner/"));
        assertEquals(BLOCK, LinkPolicy.decide(BASE, "content://com.android.contacts/"));
        assertEquals(BLOCK, LinkPolicy.decide(BASE, "data:text/html,<h1>hi</h1>"));
        assertEquals(BLOCK, LinkPolicy.decide(BASE, "market://details?id=x"));
        assertEquals(BLOCK, LinkPolicy.decide(BASE, "sms:5551234"));
        assertEquals(BLOCK, LinkPolicy.decide(BASE, "about:blank"));
        assertEquals(BLOCK, LinkPolicy.decide(BASE, ""));
        assertEquals(BLOCK, LinkPolicy.decide(BASE, "/relative/path"));
        assertEquals(BLOCK, LinkPolicy.decide(BASE, null));
    }

    @Test
    public void onlyWebUrlsCountAsWebUrls() {
        assertTrue(LinkPolicy.isWebUrl("http://a.example/"));
        assertTrue(LinkPolicy.isWebUrl("HTTPS://a.example/"));
        assertFalse(LinkPolicy.isWebUrl("intent://x"));
        assertFalse(LinkPolicy.isWebUrl("about:blank"));
        assertFalse(LinkPolicy.isWebUrl(null));
    }

    @Test
    public void signedInAreaIsEverythingUnderApp() {
        assertTrue(LinkPolicy.isSignedInArea(BASE + "/app"));
        assertTrue(LinkPolicy.isSignedInArea(BASE + "/app/"));
        assertTrue(LinkPolicy.isSignedInArea(BASE + "/app/today"));
        assertTrue(LinkPolicy.isSignedInArea(BASE + "/app?tab=1"));
        assertTrue(LinkPolicy.isSignedInArea(BASE + "/app#x"));

        assertFalse(LinkPolicy.isSignedInArea(BASE + "/login"));
        assertFalse(LinkPolicy.isSignedInArea(BASE + "/signup"));
        assertFalse(LinkPolicy.isSignedInArea(BASE + "/forgot-password"));
        assertFalse(LinkPolicy.isSignedInArea(BASE + "/"));
        assertFalse(LinkPolicy.isSignedInArea(BASE));
        assertFalse(LinkPolicy.isSignedInArea(BASE + "?q=/app"));
        assertFalse(LinkPolicy.isSignedInArea(BASE + "/application"));
        assertFalse(LinkPolicy.isSignedInArea(BASE + "/login?next=/app"));
        assertFalse(LinkPolicy.isSignedInArea("about:blank"));
        assertFalse(LinkPolicy.isSignedInArea(null));
    }
}
