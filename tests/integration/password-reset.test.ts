import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findUsableResetToken,
  hashResetToken,
  issuePasswordResetToken,
  requestPasswordReset,
  resetPassword,
  resetPasswordWithToken,
  RESET_REQUEST_WINDOW_MS,
  RESET_TOKEN_TTL_MS,
} from "@/lib/auth/password-reset";
import { verifyPassword } from "@/lib/auth/password";
import type { EmailEnv } from "@/lib/email/config";
import {
  createCapturingTransport,
  createDeferredQueue,
  createTestSession,
  createTestUser,
  db,
  getPasswordHash,
  listResetTokens,
  resetDatabase,
  tokenFromEmail,
  type TestUser,
} from "./helpers";

/**
 * The forgot-password flow against a real database.
 *
 * Every guarantee here — one live link per account, single use, the hourly
 * limit, revocation on reset — is enforced by rows, locks and transactions, so
 * it is tested where those actually run. Email never leaves the process: the
 * transport is a recorder, and the work Next would defer with `after` is
 * collected and awaited explicitly.
 */

const OLD_PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "a-brand-new-password";

/** Email configured, APP_URL set: the shape of a real deployment. */
const EMAIL_ENV = {
  SMTP_URL: "smtps://sender%40example.test:app-password@smtp.example.test:465",
  EMAIL_FROM: "NOVA <sender@example.test>",
  APP_URL: "https://planner.example.test",
};

let user: TestUser;
let mail: ReturnType<typeof createCapturingTransport>;
let queue: ReturnType<typeof createDeferredQueue>;

beforeEach(async () => {
  await resetDatabase();
  user = await createTestUser();
  mail = createCapturingTransport();
  queue = createDeferredQueue();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

/** Submits the forgot-password form's work and waits for what it deferred. */
async function request(email: string, options: { now?: Date; env?: EmailEnv } = {}) {
  const outcome = requestPasswordReset(email, {
    defer: queue.defer,
    env: options.env ?? EMAIL_ENV,
    transport: mail.transport,
    ...(options.now ? { now: options.now } : {}),
  });
  await queue.flush();
  return outcome;
}

/** Requests a link for `email` and returns the raw token from the email. */
async function requestToken(email: string, now?: Date): Promise<string> {
  const before = mail.sent.length;
  await request(email, now ? { now } : {});
  const message = mail.sent[before];
  if (!message) throw new Error("No email was sent");
  return tokenFromEmail(message);
}

describe("requesting a reset link", () => {
  it("does nothing observable for an address with no account", async () => {
    const outcome = await request("nobody@example.test");

    expect(outcome).toEqual({ status: "accepted", delivery: "email" });
    expect(await db.passwordResetToken.count()).toBe(0);
    expect(mail.sent).toHaveLength(0);
  });

  it("gives exactly the same answer for a registered and an unregistered address", async () => {
    const known = await request(user.email);
    const unknown = await request("nobody@example.test");

    expect(unknown).toEqual(known);
    // And both did the same amount of work in the request itself: none. The
    // account-specific part was all handed off.
    expect(queue.scheduled).toBe(2);
  });

  it("stores one keyed hash and emails the raw token, which is never stored", async () => {
    await request(user.email);

    const rows = await listResetTokens(user.id);
    expect(rows).toHaveLength(1);
    expect(mail.sent).toHaveLength(1);

    const token = tokenFromEmail(mail.sent[0]!);
    const row = rows[0]!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toBe(hashResetToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(row.usedAt).toBeNull();
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(RESET_TOKEN_TTL_MS);
  });

  it("sends a complete message to the account's own address", async () => {
    await request(user.email);
    const message = mail.sent[0]!;
    const token = tokenFromEmail(message);

    expect(message.to).toBe(user.email);
    expect(message.subject).toBe("Reset your NOVA password");
    expect(message.text).toContain(`https://planner.example.test/reset-password?token=${token}`);
    expect(message.html).toContain(`https://planner.example.test/reset-password?token=${token}`);
    expect(message.text).toContain("30 minutes");
    expect(message.text).toMatch(/ignore this email/i);
  });

  it("puts nothing the account holder chose into the email", async () => {
    // No address is verified at sign-up, so this "name" may belong to someone
    // who registered a stranger's address to send them this text.
    const bait = "Your account is suspended, verify at http://evil.example/x";
    await db.user.update({ where: { id: user.id }, data: { name: bait } });

    await request(user.email);
    const message = mail.sent[0]!;

    for (const part of [message.subject, message.text, message.html]) {
      expect(part).not.toContain("evil.example");
      expect(part).not.toContain("suspended");
    }
    expect(message.text.startsWith("Hi,\n")).toBe(true);
  });

  it("matches the address however it was typed", async () => {
    await request(`  ${user.email.toUpperCase()}  `);

    expect(await listResetTokens(user.id)).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe(user.email);
  });

  it("keeps only the newest link working", async () => {
    const first = await requestToken(user.email);
    const second = await requestToken(user.email);

    expect(await findUsableResetToken(first)).toBeNull();
    expect(await findUsableResetToken(second)).toEqual({ email: user.email });

    expect(await resetPasswordWithToken(first, NEW_PASSWORD)).toEqual({ ok: false });
    expect(await verifyPassword(OLD_PASSWORD, await getPasswordHash(user.id))).toBe(true);

    expect((await resetPasswordWithToken(second, NEW_PASSWORD)).ok).toBe(true);
  });

  it("issues at most three links per account per hour, silently", async () => {
    const t0 = new Date();
    const outcomes = [];
    for (let i = 0; i < 3; i++) outcomes.push(await request(user.email, { now: new Date(t0.getTime() + i * 60_000) }));
    const fourth = await request(user.email, { now: new Date(t0.getTime() + 10 * 60_000) });

    expect(await listResetTokens(user.id)).toHaveLength(3);
    expect(mail.sent).toHaveLength(3);
    // The refusal is invisible: same outcome as every accepted request.
    expect(fourth).toEqual(outcomes[0]);

    // The third link is still the live one; the refused fourth request did
    // not supersede it.
    const third = tokenFromEmail(mail.sent[2]!);
    expect(await findUsableResetToken(third, new Date(t0.getTime() + 11 * 60_000))).toEqual({ email: user.email });
  });

  it("counts a rolling hour, not a fixed one", async () => {
    const t0 = new Date();
    for (let i = 0; i < 3; i++) await request(user.email, { now: new Date(t0.getTime() + i * 1000) });

    // Just inside the hour from the first request: still refused.
    await request(user.email, { now: new Date(t0.getTime() + RESET_REQUEST_WINDOW_MS - 1000) });
    expect(mail.sent).toHaveLength(3);

    // Once the first request has aged out, one more is allowed.
    await request(user.email, { now: new Date(t0.getTime() + RESET_REQUEST_WINDOW_MS + 500) });
    expect(mail.sent).toHaveLength(4);
  });

  it("holds the limit under simultaneous requests", async () => {
    const outcomes = Array.from({ length: 8 }, () =>
      requestPasswordReset(user.email, { defer: queue.defer, env: EMAIL_ENV, transport: mail.transport }),
    );
    await queue.flush();

    expect(new Set(outcomes.map((o) => JSON.stringify(o))).size).toBe(1);
    expect(await listResetTokens(user.id)).toHaveLength(3);
    expect(mail.sent).toHaveLength(3);

    // And of the three, exactly one is live.
    const live = await Promise.all(mail.sent.map((m) => findUsableResetToken(tokenFromEmail(m))));
    expect(live.filter(Boolean)).toHaveLength(1);
  });

  it("survives a transport that fails, and says so only in the server log", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const outcome = requestPasswordReset(user.email, {
      defer: queue.defer,
      env: EMAIL_ENV,
      transport: {
        kind: "smtp",
        async send() {
          throw new Error("connection refused");
        },
      },
    });
    await queue.flush();

    expect(outcome).toEqual({ status: "accepted", delivery: "email" });
    expect(errors).toHaveBeenCalled();
  });
});

describe("where the link points", () => {
  it("refuses to send when email is configured but APP_URL is not", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    for (const env of [
      { SMTP_URL: EMAIL_ENV.SMTP_URL, EMAIL_FROM: EMAIL_ENV.EMAIL_FROM },
      { RESEND_API_KEY: "re_test_key", EMAIL_FROM: EMAIL_ENV.EMAIL_FROM },
    ]) {
      const outcome = await request(user.email, { env });
      expect(outcome).toEqual({ status: "unavailable" });
    }

    // Refused before any account-specific work, so it cannot differ by
    // address — and nothing was created that a later request would count.
    expect(queue.scheduled).toBe(0);
    expect(await listResetTokens(user.id)).toHaveLength(0);
    expect(mail.sent).toHaveLength(0);
    expect(errors.mock.calls.flat().join(" ")).toContain("APP_URL must be set");
  });

  it("is unavailable in the same way for an unregistered address", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const env = { SMTP_URL: EMAIL_ENV.SMTP_URL, EMAIL_FROM: EMAIL_ENV.EMAIL_FROM };

    expect(await request("nobody@example.test", { env })).toEqual(await request(user.email, { env }));
  });

  it("uses APP_URL when email is configured", async () => {
    await request(user.email);
    const link = mail.sent[0]!.text.match(/https?:\/\/\S+/)?.[0] ?? "";

    expect(link.startsWith("https://planner.example.test/reset-password?token=")).toBe(true);
  });

  it("points a printed link at this machine when nothing is emailed", async () => {
    for (const [env, expected] of [
      [{ PORT: "3100" }, "http://localhost:3100"],
      [{}, "http://localhost:3000"],
      // APP_URL still wins: it is the operator's own statement of the address.
      [{ APP_URL: "http://192.168.1.20:3000", PORT: "3100" }, "http://192.168.1.20:3000"],
    ] as const) {
      const sent = createCapturingTransport();
      const deferred = createDeferredQueue();
      const outcome = requestPasswordReset(user.email, {
        defer: deferred.defer,
        env,
        transport: { ...sent.transport, kind: "console" },
      });
      await deferred.flush();
      // Cleared between cases so the hourly limit never interferes.
      await db.passwordResetToken.deleteMany({ where: { userId: user.id } });

      expect(outcome).toEqual({ status: "accepted", delivery: "console" });
      expect(sent.sent[0]?.text).toContain(`${expected}/reset-password?token=`);
    }
  });

  it("prints the link in an unmistakable banner when no provider is configured", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const outcome = requestPasswordReset(user.email, { defer: queue.defer, env: { PORT: "3000" } });
    await queue.flush();

    expect(outcome).toEqual({ status: "accepted", delivery: "console" });
    const printed = log.mock.calls.map((call) => String(call[0])).join("\n");
    expect(printed).toContain("EMAIL NOT SENT");
    expect(printed).toContain(`To:      ${user.email}`);
    expect(printed).toMatch(/http:\/\/localhost:3000\/reset-password\?token=[A-Za-z0-9_-]{43}/);
  });

  it("says in the terminal when a request was refused, without printing a link", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const printLink = async () => {
      requestPasswordReset(user.email, { defer: queue.defer, env: {} });
      await queue.flush();
    };
    for (let i = 0; i < 3; i++) await printLink();
    const printedBefore = log.mock.calls.length;

    await printLink();

    // Without this notice the refused request printed nothing, the page said
    // a link had been printed, and the newest banner on screen was whichever
    // request last got through.
    const notice = log.mock.calls.slice(printedBefore).map((call) => String(call[0])).join("\n");
    expect(notice).toContain("NO RESET LINK PRINTED");
    expect(notice).toContain(`Account: ${user.email}`);
    expect(notice).not.toMatch(/reset-password\?token=/);
    expect(await listResetTokens(user.id)).toHaveLength(3);
  });

  it("prints nothing at all for an address with no account", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    requestPasswordReset("nobody@example.test", { defer: queue.defer, env: {} });
    await queue.flush();

    expect(log).not.toHaveBeenCalled();
  });
});

describe("resetPassword(token, newPassword, confirm)", () => {
  it("holds the new password to sign-up's rules without spending the link", async () => {
    const token = await requestToken(user.email);

    const short = await resetPassword(token, "short", "short");
    expect(short).toEqual({ status: "invalid-input", errors: { password: "Use at least 8 characters." } });

    const long = "x".repeat(201);
    expect((await resetPassword(token, long, long)).status).toBe("invalid-input");

    expect(await findUsableResetToken(token)).toEqual({ email: user.email });
    expect(await verifyPassword(OLD_PASSWORD, await getPasswordHash(user.id))).toBe(true);
  });

  it("requires the confirmation to match, again without spending the link", async () => {
    const token = await requestToken(user.email);

    expect(await resetPassword(token, NEW_PASSWORD, `${NEW_PASSWORD}!`)).toEqual({
      status: "invalid-input",
      errors: { confirmPassword: "The passwords do not match." },
    });
    expect(await findUsableResetToken(token)).toEqual({ email: user.email });

    expect(await resetPassword(token, NEW_PASSWORD, NEW_PASSWORD)).toEqual({ status: "reset", userId: user.id });
    expect(await verifyPassword(NEW_PASSWORD, await getPasswordHash(user.id))).toBe(true);
  });

  it("reports every unusable link the same way, even alongside bad input", async () => {
    const token = await requestToken(user.email);
    await resetPassword(token, NEW_PASSWORD, NEW_PASSWORD);

    expect(await resetPassword(token, NEW_PASSWORD, NEW_PASSWORD)).toEqual({ status: "invalid-link" });
    expect(await resetPassword("garbage", NEW_PASSWORD, NEW_PASSWORD)).toEqual({ status: "invalid-link" });
    expect(await resetPassword("A".repeat(43), NEW_PASSWORD, NEW_PASSWORD)).toEqual({ status: "invalid-link" });
    // A dead link wins over field errors that could never help.
    expect(await resetPassword("garbage", "short", "different")).toEqual({ status: "invalid-link" });
  });

  it("reports a dead but well-formed link before any field error", async () => {
    // The link dies after the page loaded — superseded by a newer request
    // here, or expired while they typed — and the first submission has a
    // typo. Fixing the typo could never help, so they hear about the link now.
    const superseded = await requestToken(user.email);
    const live = await requestToken(user.email);

    expect(await resetPassword(superseded, "short", "short")).toEqual({ status: "invalid-link" });
    expect(await resetPassword(superseded, NEW_PASSWORD, `${NEW_PASSWORD}!`)).toEqual({ status: "invalid-link" });
    expect(await resetPassword(` ${superseded} `, "", "")).toEqual({ status: "invalid-link" });

    const later = new Date(Date.now() + RESET_TOKEN_TTL_MS + 1000);
    expect(await resetPassword(live, "short", "short", later)).toEqual({ status: "invalid-link" });

    // The live link still reports field errors, and is still usable.
    expect((await resetPassword(live, "short", "short")).status).toBe("invalid-input");
    expect(await findUsableResetToken(live)).toEqual({ email: user.email });
  });

  it("sets the password sign-in will accept, trimmed the same way", async () => {
    const token = await requestToken(user.email);
    await resetPassword(token, `  ${NEW_PASSWORD}  `, NEW_PASSWORD);

    expect(await verifyPassword(NEW_PASSWORD, await getPasswordHash(user.id))).toBe(true);
  });
});

describe("resetting the password", () => {
  it("changes the password, spends the link, and signs out every device", async () => {
    const superseded = await requestToken(user.email);
    const token = await requestToken(user.email);
    await createTestSession(user.id);
    await createTestSession(user.id);

    const outcome = await resetPasswordWithToken(token, NEW_PASSWORD);
    expect(outcome).toEqual({ ok: true, userId: user.id });

    const hash = await getPasswordHash(user.id);
    expect(await verifyPassword(OLD_PASSWORD, hash)).toBe(false);
    expect(await verifyPassword(NEW_PASSWORD, hash)).toBe(true);

    // Both rows are kept — they are what the hourly limit counts — but only
    // the spent one records a use, and neither works any more.
    const rows = await listResetTokens(user.id);
    expect(rows.map((row) => row.tokenHash)).toEqual([hashResetToken(superseded), hashResetToken(token)]);
    expect(rows[1]?.usedAt).not.toBeNull();
    expect(rows[0]?.usedAt).toBeNull();
    expect(await findUsableResetToken(superseded)).toBeNull();
    expect(await findUsableResetToken(token)).toBeNull();

    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("stops any other outstanding link from working", async () => {
    const token = await requestToken(user.email);
    // A second live row can only exist briefly, from a request that raced
    // this reset; written directly here to make that moment last.
    const racing = "R".repeat(43);
    await db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashResetToken(racing), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });

    expect((await resetPasswordWithToken(token, NEW_PASSWORD)).ok).toBe(true);

    expect(await findUsableResetToken(racing)).toBeNull();
    expect(await resetPasswordWithToken(racing, "attacker-password")).toEqual({ ok: false });
    expect(await listResetTokens(user.id)).toHaveLength(2);
  });

  it("does not hand out a fresh hourly allowance", async () => {
    const t0 = new Date();
    const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
    for (let i = 0; i < 3; i++) await request(user.email, { now: at(i) });
    const third = tokenFromEmail(mail.sent[2]!);

    expect((await resetPasswordWithToken(third, NEW_PASSWORD, at(3))).ok).toBe(true);

    // Still three links this hour, so a fourth is still refused.
    await request(user.email, { now: at(4) });
    expect(mail.sent).toHaveLength(3);
    expect(await listResetTokens(user.id)).toHaveLength(3);
  });

  it("works exactly once", async () => {
    const token = await requestToken(user.email);

    expect((await resetPasswordWithToken(token, NEW_PASSWORD)).ok).toBe(true);
    expect(await resetPasswordWithToken(token, "yet-another-password")).toEqual({ ok: false });
    expect(await findUsableResetToken(token)).toBeNull();

    const hash = await getPasswordHash(user.id);
    expect(await verifyPassword(NEW_PASSWORD, hash)).toBe(true);
    expect(await verifyPassword("yet-another-password", hash)).toBe(false);
  });

  it("rejects an expired link", async () => {
    const issuedAt = new Date(Date.now() - RESET_TOKEN_TTL_MS - 1000);
    const token = await requestToken(user.email, issuedAt);

    expect(await findUsableResetToken(token)).toBeNull();
    expect(await resetPasswordWithToken(token, NEW_PASSWORD)).toEqual({ ok: false });
    expect(await verifyPassword(OLD_PASSWORD, await getPasswordHash(user.id))).toBe(true);
  });

  it("treats the instant of expiry as expired", async () => {
    const issued = await issuePasswordResetToken(user.email);
    if (issued.status !== "issued") throw new Error("token was not issued");

    expect(await resetPasswordWithToken(issued.token, NEW_PASSWORD, issued.expiresAt)).toEqual({ ok: false });
    expect(await resetPasswordWithToken(issued.token, NEW_PASSWORD, new Date(issued.expiresAt.getTime() - 1))).toEqual({
      ok: true,
      userId: user.id,
    });
  });

  it("rejects tampered and garbage tokens without touching anything", async () => {
    const token = await requestToken(user.email);
    await createTestSession(user.id);
    const flipped = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

    for (const bad of [
      "",
      "not-a-token",
      flipped,
      `${token}x`,
      token.slice(0, -1),
      ` ${token}`,
      hashResetToken(token),
      "A".repeat(43),
      "'; DROP TABLE \"User\"; --",
    ]) {
      expect(await resetPasswordWithToken(bad, NEW_PASSWORD)).toEqual({ ok: false });
      expect(await findUsableResetToken(bad)).toBeNull();
    }

    expect(await verifyPassword(OLD_PASSWORD, await getPasswordHash(user.id))).toBe(true);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    expect(await findUsableResetToken(token)).toEqual({ email: user.email });
  });

  it("lets exactly one of ten simultaneous submissions of the same link succeed", async () => {
    const token = await requestToken(user.email);
    const passwords = Array.from({ length: 10 }, (_, i) => `concurrent-password-${i}`);

    const outcomes = await Promise.all(passwords.map((password) => resetPasswordWithToken(token, password)));
    const winners = outcomes.flatMap((outcome, i) => (outcome.ok ? [passwords[i]!] : []));

    expect(winners).toHaveLength(1);
    const hash = await getPasswordHash(user.id);
    expect(await verifyPassword(winners[0]!, hash)).toBe(true);
    for (const loser of passwords.filter((p) => p !== winners[0])) {
      expect(await verifyPassword(loser, hash)).toBe(false);
    }

    const rows = await listResetTokens(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.usedAt).not.toBeNull();
  });

  it("says why no token was issued, for the operator's terminal alone", async () => {
    expect(await issuePasswordResetToken("nobody@example.test")).toEqual({ status: "no-account" });
    for (let i = 0; i < 3; i++) expect((await issuePasswordResetToken(user.email)).status).toBe("issued");
    expect(await issuePasswordResetToken(user.email)).toEqual({ status: "rate-limited", email: user.email });
  });

  it("only ever changes the password of the account the link was sent to", async () => {
    const other = await createTestUser();
    await createTestSession(other.id);
    const otherHashBefore = await getPasswordHash(other.id);
    const otherToken = await requestToken(other.email);

    const token = await requestToken(user.email);
    expect(await resetPasswordWithToken(token, NEW_PASSWORD)).toEqual({ ok: true, userId: user.id });

    // The other account is exactly as it was: password, sessions and its own
    // outstanding link all untouched.
    expect(await getPasswordHash(other.id)).toBe(otherHashBefore);
    expect(await db.session.count({ where: { userId: other.id } })).toBe(1);
    expect(await findUsableResetToken(otherToken)).toEqual({ email: other.email });

    // And user A's spent link cannot be pointed at B by any means: the API
    // takes no account at all, so all that is left to try is replaying it.
    expect(await resetPasswordWithToken(token, "attacker-password")).toEqual({ ok: false });
    expect(await getPasswordHash(other.id)).toBe(otherHashBefore);
  });

  it("does not spend the link when the page merely checks it", async () => {
    const token = await requestToken(user.email);

    for (let i = 0; i < 3; i++) expect(await findUsableResetToken(token)).toEqual({ email: user.email });
    expect((await resetPasswordWithToken(token, NEW_PASSWORD)).ok).toBe(true);
  });

  it("disappears with the account", async () => {
    await requestToken(user.email);
    await db.user.delete({ where: { id: user.id } });

    expect(await db.passwordResetToken.count()).toBe(0);
  });
});
