import { afterEach, describe, expect, it, vi } from "vitest";
import { buildResetLink, resolveEmailProvider, resolveLinkBase } from "@/lib/email/config";
import { escapeHtml, renderPasswordResetEmail } from "@/lib/email/templates";
import { createEmailTransport, EmailDeliveryError, formatConsoleEmail, formatConsoleNotice } from "@/lib/email/transport";

// No test in this file may reach a mail server, so nodemailer itself is
// replaced: the SMTP transport is checked by what it hands over.
const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn(async (_message: unknown) => ({ messageId: "test" }));
  const createTransport = vi.fn((_options: unknown) => ({ sendMail }));
  return { sendMail, createTransport };
});
vi.mock("nodemailer", () => ({ createTransport, default: { createTransport } }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sendMail.mockClear();
  createTransport.mockClear();
});

const CONSOLE = { kind: "console" } as const;
const SMTP = { kind: "smtp", url: "smtps://a%40b.test:pw@smtp.b.test:465", from: "a@b.test" } as const;

describe("resolveEmailProvider", () => {
  it("prints to the console when nothing is configured", () => {
    expect(resolveEmailProvider({})).toEqual({ ok: true, value: CONSOLE });
    expect(resolveEmailProvider({ RESEND_API_KEY: "  ", SMTP_URL: "" })).toEqual({ ok: true, value: CONSOLE });
  });

  it("selects Resend by API key", () => {
    expect(resolveEmailProvider({ RESEND_API_KEY: "re_123", EMAIL_FROM: "NOVA <a@b.test>" })).toEqual({
      ok: true,
      value: { kind: "resend", apiKey: "re_123", from: "NOVA <a@b.test>" },
    });
  });

  it("selects SMTP by URL, including Gmail's app-password form", () => {
    const url = "smtps://you%40gmail.com:abcd-efgh-ijkl-mnop@smtp.gmail.com:465";
    expect(resolveEmailProvider({ SMTP_URL: url, EMAIL_FROM: "you@gmail.com" })).toEqual({
      ok: true,
      value: { kind: "smtp", url, from: "you@gmail.com" },
    });
  });

  it("prefers Resend when both are set", () => {
    const result = resolveEmailProvider({ RESEND_API_KEY: "re_1", SMTP_URL: SMTP.url, EMAIL_FROM: "a@b.test" });
    expect(result.ok && result.value.kind).toBe("resend");
  });

  it("refuses a provider with no sender", () => {
    expect(resolveEmailProvider({ RESEND_API_KEY: "re_1" }).ok).toBe(false);
    expect(resolveEmailProvider({ SMTP_URL: SMTP.url }).ok).toBe(false);
  });

  it("refuses a sender that could inject headers", () => {
    expect(resolveEmailProvider({ RESEND_API_KEY: "re_1", EMAIL_FROM: "a@b.test\r\nBcc: x@evil.test" }).ok).toBe(false);
    expect(resolveEmailProvider({ RESEND_API_KEY: "re_1", EMAIL_FROM: "no-at-sign" }).ok).toBe(false);
  });

  it("refuses a malformed SMTP URL without echoing its password", () => {
    for (const url of ["not a url :pw", "https://user:secret-pw@smtp.b.test"]) {
      const result = resolveEmailProvider({ SMTP_URL: url, EMAIL_FROM: "a@b.test" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.problem).not.toContain("pw");
    }
  });
});

describe("resolveLinkBase", () => {
  it("uses APP_URL whenever it is set", () => {
    expect(resolveLinkBase({ APP_URL: "https://planner.example.test/" }, SMTP)).toEqual({
      ok: true,
      value: "https://planner.example.test",
    });
    expect(resolveLinkBase({ APP_URL: "http://192.168.1.20:3000", PORT: "4000" }, CONSOLE)).toEqual({
      ok: true,
      value: "http://192.168.1.20:3000",
    });
  });

  it("keeps a sub-path in APP_URL", () => {
    expect(resolveLinkBase({ APP_URL: "https://example.test/planner//" }, SMTP)).toEqual({
      ok: true,
      value: "https://example.test/planner",
    });
  });

  it("requires APP_URL once real email is configured", () => {
    for (const provider of [SMTP, { kind: "resend", apiKey: "re_1", from: "a@b.test" } as const]) {
      const result = resolveLinkBase({ PORT: "3000" }, provider);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.problem).toContain("APP_URL must be set");
    }
  });

  it("refuses an APP_URL that is not a plain http(s) origin", () => {
    for (const APP_URL of ["planner.example.test", "javascript:alert(1)", "ftp://x.test", "https://u:p@x.test", "https://x.test/?a=1", "https://x.test/#a"]) {
      expect(resolveLinkBase({ APP_URL }, SMTP).ok, APP_URL).toBe(false);
    }
  });

  // The request is not even an input any more: whoever sends it chooses its
  // Host and X-Forwarded-Host, and a printed link must not point wherever they
  // like. Only the server's own configuration decides.
  it("points a printed link at this machine when APP_URL is unset", () => {
    expect(resolveLinkBase({ PORT: "3100" }, CONSOLE)).toEqual({ ok: true, value: "http://localhost:3100" });
    expect(resolveLinkBase({ PORT: " 8080 " }, CONSOLE)).toEqual({ ok: true, value: "http://localhost:8080" });
  });

  it("falls back to Next's default port when PORT is missing or not a port", () => {
    for (const PORT of [undefined, "", "abc", "0", "65536", "3000/evil", "-1", "80.5"]) {
      expect(resolveLinkBase({ PORT }, CONSOLE), String(PORT)).toEqual({ ok: true, value: "http://localhost:3000" });
    }
  });

  it("builds the reset link on the base", () => {
    expect(buildResetLink("https://x.test", "abc_-DEF")).toBe("https://x.test/reset-password?token=abc_-DEF");
  });
});

describe("renderPasswordResetEmail", () => {
  const link = "https://planner.example.test/reset-password?token=abc";

  it("says what it is, how long it lasts and that it can be ignored", () => {
    const email = renderPasswordResetEmail({ appName: "NOVA", link, expiresInMinutes: 30 });

    expect(email.subject).toBe("Reset your NOVA password");
    for (const part of [email.text, email.html]) {
      expect(part).toContain(link);
      expect(part).toContain("30 minutes");
      expect(part).toMatch(/ignore this email/i);
    }
    expect(email.text.startsWith("Hi,\n")).toBe(true);
    expect(email.text).not.toMatch(/<[a-z]/i);
  });

  it("has no place for anything the account holder typed", () => {
    // Sign-up does not verify addresses, so a "name" is attacker text sent
    // from this server's real sender. The template cannot be handed one.
    const input = { appName: "NOVA", link, expiresInMinutes: 30, recipientName: "Verify at http://evil.example/x" };
    const email = renderPasswordResetEmail(input as Parameters<typeof renderPasswordResetEmail>[0]);

    for (const part of [email.subject, email.text, email.html]) {
      expect(part).not.toContain("evil.example");
    }
  });

  it("escapes every interpolated value in the HTML", () => {
    const email = renderPasswordResetEmail({
      appName: `<b>App</b> <script>alert("x")</script> & 'friends'`,
      link: `https://x.test/reset-password?token=a"><img src=x onerror=alert(1)>`,
      expiresInMinutes: 30,
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>App</b>");
    expect(email.html).not.toContain('"><img');
    expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;friends&#39;");
    expect(email.html).toContain("&lt;b&gt;App&lt;/b&gt;");
  });

  it("keeps the subject to a single line", () => {
    const email = renderPasswordResetEmail({ appName: "NOVA\r\nBcc: x@evil.test", link, expiresInMinutes: 30 });
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("loads nothing remote when opened", () => {
    const { html } = renderPasswordResetEmail({ appName: "NOVA", link, expiresInMinutes: 30 });
    expect(html).not.toMatch(/<img|<link|<script|url\(/i);
  });
});

describe("escapeHtml", () => {
  it("escapes the five significant characters and nothing else", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
    expect(escapeHtml("plain text 123 – ü")).toBe("plain text 123 – ü");
  });
});

describe("transports", () => {
  const message = { to: "ada@example.test", subject: "Reset your NOVA password", text: "Hi\n\nhttps://x.test/r", html: "<p>Hi</p>" };

  it("posts to Resend's API with the key, both parts and a timeout", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createEmailTransport({ kind: "resend", apiKey: "re_secret", from: "NOVA <a@b.test>" }).send(message);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_secret");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({
      from: "NOVA <a@b.test>",
      to: ["ada@example.test"],
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  });

  it("turns a Resend refusal into a delivery error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"message":"domain not verified"}', { status: 403 })));

    const sending = createEmailTransport({ kind: "resend", apiKey: "re_secret", from: "a@b.test" }).send(message);
    await expect(sending).rejects.toBeInstanceOf(EmailDeliveryError);
    await expect(sending).rejects.toThrow(/HTTP 403/);
  });

  it("hands SMTP messages to nodemailer with the configured sender", async () => {
    await createEmailTransport(SMTP).send(message);

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ url: SMTP.url }));
    expect(sendMail).toHaveBeenCalledWith({ from: SMTP.from, ...message });
  });

  it("wraps an SMTP failure without leaking the connection URL", async () => {
    sendMail.mockRejectedValueOnce(new Error("535 auth failed"));

    const sending = createEmailTransport(SMTP).send(message);
    await expect(sending).rejects.toBeInstanceOf(EmailDeliveryError);
    await expect(sending).rejects.not.toThrow(/pw@/);
  });

  it("prints the whole message in a banner, in one write, when nothing is configured", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await createEmailTransport(CONSOLE).send(message);

    expect(log).toHaveBeenCalledTimes(1);
    const printed = String(log.mock.calls[0]![0]);
    expect(printed).toBe(formatConsoleEmail(message));
    expect(printed).toContain("EMAIL NOT SENT");
    expect(printed).toContain("To:      ada@example.test");
    expect(printed).toContain("Subject: Reset your NOVA password");
    expect(printed).toContain("  https://x.test/r");
  });

  it("never prints terminal control sequences smuggled into the message", () => {
    const printed = formatConsoleEmail({
      ...message,
      to: "mallory\u001b[2J@example.test",
      text: "Hi \u001b[2J\u001b[31mMallory\u0007,\r\n\nhttps://x.test/r",
    });

    expect(printed).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/);
    expect(printed).toContain("To:      mallory[2J@example.test");
    expect(printed).toContain("Hi [2J[31mMallory,");
    expect(printed).toContain("  https://x.test/r");
  });

  it("tells the operator how to open a printed link from another device", () => {
    const printed = formatConsoleEmail(message);
    expect(printed).toMatch(/localhost/);
    expect(printed).toMatch(/another device/);
  });

  it("frames an operator notice like the banner, with the same scrubbing", () => {
    const printed = formatConsoleNotice("NOTICE", ["Account: mallory\u001b[2J@example.test", "", "second line"]);

    expect(printed).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/);
    expect(printed.split("\n")).toEqual([
      "",
      "=".repeat(76),
      "  NOTICE",
      "=".repeat(76),
      "  Account: mallory[2J@example.test",
      "",
      "  second line",
      "=".repeat(76),
      "",
    ]);
  });
});
