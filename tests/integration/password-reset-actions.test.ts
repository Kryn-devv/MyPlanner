import { randomBytes, scryptSync } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as openResetLink } from "@/app/(auth)/reset-password/route";
import { signInAction, signUpAction } from "@/lib/auth/actions";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import { issuePasswordResetToken, resetPasswordWithToken, RESET_TOKEN_COOKIE } from "@/lib/auth/password-reset";
import { forgotPasswordAction, resetPasswordAction } from "@/lib/auth/reset-actions";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { createTestUser, db, getPasswordHash, resetDatabase, type TestUser } from "./helpers";

/**
 * The reset flow through its public entry points: the Server Actions and the
 * route the emailed link lands on.
 *
 * Next's request APIs are replaced by the smallest stand-ins that behave the
 * same way — a cookie jar that reads back what was just written, as Next's
 * does inside an action, and a `redirect` that throws — so the actions run
 * unmodified against the real database.
 */

const { jar, requestHeaders, deferred, gate, RedirectSignal } = vi.hoisted(() => {
  class RedirectSignal extends Error {
    constructor(readonly url: string) {
      super(`redirected to ${url}`);
    }
  }
  return {
    jar: new Map<string, string>(),
    requestHeaders: { current: new Headers() },
    deferred: [] as Promise<void>[],
    /** When set, the next password verification pauses here once it has its answer. */
    gate: { next: null as null | { reached: () => void; release: Promise<void> } },
    RedirectSignal,
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (cookie: string | { name: string }) => void jar.delete(typeof cookie === "string" ? cookie : cookie.name),
  }),
  headers: async () => requestHeaders.current,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => void deferred.push(task()),
}));

vi.mock("@/lib/auth/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/password")>();
  return {
    ...actual,
    async verifyPassword(password: string, storedHash: string) {
      const verdict = await actual.verifyPassword(password, storedHash);
      const hold = gate.next;
      if (hold) {
        gate.next = null;
        hold.reached();
        await hold.release;
      }
      return verdict;
    },
  };
});

const OLD_PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "a-brand-new-password";
const INCORRECT = { errors: { _form: "Incorrect email or password." } };
const MALFORMED = { errors: { _form: "Something went wrong. Please try again." } };

let user: TestUser;

beforeEach(async () => {
  await resetDatabase();
  user = await createTestUser();
  jar.clear();
  requestHeaders.current = new Headers();
  deferred.length = 0;
  gate.next = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** Holds the next sign-in between checking the password and acting on it. */
function pauseAfterNextVerification() {
  let reached!: () => void;
  let release!: () => void;
  const reachedPromise = new Promise<void>((resolve) => (reached = resolve));
  gate.next = { reached, release: new Promise<void>((resolve) => (release = resolve)) };
  return { reached: reachedPromise, release };
}

/** Runs an action that ends in `redirect`, and returns where it went. */
async function redirectedTo(action: Promise<unknown>): Promise<string> {
  try {
    await action;
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    throw error;
  }
  throw new Error("the action returned instead of redirecting");
}

/** A hash of `password` made with weaker scrypt parameters than the app now uses. */
function weakHash(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize("NFKC"), salt, 64, { N: 1024, r: 8, p: 1 });
  return ["scrypt", 1024, 8, 1, salt.toString("base64"), derived.toString("base64")].join("$");
}

async function issueToken(email: string): Promise<string> {
  const issued = await issuePasswordResetToken(email);
  if (issued.status !== "issued") throw new Error("token was not issued");
  return issued.token;
}

/**
 * Waits until some connection is blocked on a row lock while taking a share
 * lock — the sign-in's check queued behind an open reset.
 */
async function waitForShareLockWait(timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [row] = await db.$queryRaw<{ waiting: bigint }[]>`
      SELECT count(*) AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%for share%'
    `;
    if (row && row.waiting > 0n) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the sign-in never waited on the reset's row lock");
}

describe("signing in around a reset", () => {
  it("still signs in with the right password", async () => {
    const outcome = signInAction({}, form({ email: user.email, password: OLD_PASSWORD }));

    expect(await redirectedTo(outcome)).toBe("/app");
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    expect(jar.has(SESSION_COOKIE)).toBe(true);
  });

  it("gives no session to a sign-in that checked the old password just before a reset", async () => {
    const token = await issueToken(user.email);
    const paused = pauseAfterNextVerification();
    const signingIn = signInAction({}, form({ email: user.email, password: OLD_PASSWORD }));

    // The old password has been verified against the old hash, but no
    // session exists yet — and now the reset commits, deleting every session
    // it can see.
    await paused.reached;
    expect(await resetPasswordWithToken(token, NEW_PASSWORD)).toEqual({ ok: true, userId: user.id });
    paused.release();

    expect(await signingIn).toEqual({ ...INCORRECT, values: { email: user.email } });
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("makes a sign-in that checks mid-reset wait for the reset, and then lose", async () => {
    const paused = pauseAfterNextVerification();
    const signingIn = signInAction({}, form({ email: user.email, password: OLD_PASSWORD }));
    await paused.reached;

    const newHash = await hashPassword(NEW_PASSWORD);
    await db.$transaction(
      async (tx) => {
        // What the reset transaction does, held open: the new hash, then
        // every session that exists so far deleted.
        await tx.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
        await tx.session.deleteMany({ where: { userId: user.id } });

        // The sign-in now creates its session — which that delete could not
        // see — and must block on the row lock rather than read the old hash
        // this uncommitted transaction is hiding.
        paused.release();
        await waitForShareLockWait();
      },
      { timeout: 20_000 },
    );

    expect(await signingIn).toEqual({ ...INCORRECT, values: { email: user.email } });
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("never writes a hash of the old password over a reset while upgrading it", async () => {
    await db.user.update({ where: { id: user.id }, data: { passwordHash: weakHash(OLD_PASSWORD) } });
    const token = await issueToken(user.email);

    const paused = pauseAfterNextVerification();
    const signingIn = signInAction({}, form({ email: user.email, password: OLD_PASSWORD }));
    await paused.reached;
    expect((await resetPasswordWithToken(token, NEW_PASSWORD)).ok).toBe(true);
    paused.release();

    expect(await signingIn).toEqual({ ...INCORRECT, values: { email: user.email } });
    const hash = await getPasswordHash(user.id);
    expect(await verifyPassword(NEW_PASSWORD, hash)).toBe(true);
    expect(await verifyPassword(OLD_PASSWORD, hash)).toBe(false);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("still upgrades a weak hash on an ordinary sign-in, and keeps the session", async () => {
    await db.user.update({ where: { id: user.id }, data: { passwordHash: weakHash(OLD_PASSWORD) } });

    expect(await redirectedTo(signInAction({}, form({ email: user.email, password: OLD_PASSWORD })))).toBe("/app");

    const hash = await getPasswordHash(user.id);
    expect(needsRehash(hash)).toBe(false);
    expect(await verifyPassword(OLD_PASSWORD, hash)).toBe(true);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
  });
});

describe("action arguments", () => {
  // An action is a public endpoint: anyone can post it a JSON array. Each of
  // these used to throw inside the validator — an HTTP 500 and a server-log
  // entry per request.
  for (const bogus of [{}, "x", null, 42]) {
    it(`answers a ${JSON.stringify(bogus)} argument without throwing`, async () => {
      const argument = bogus as unknown as FormData;

      expect(await signInAction({}, argument)).toEqual(MALFORMED);
      expect(await signUpAction({}, argument)).toEqual(MALFORMED);
      expect(await forgotPasswordAction({}, argument)).toEqual(MALFORMED);
      expect(await resetPasswordAction({}, argument)).toEqual({ invalid: true });
      expect(await db.user.count()).toBe(1);
    });
  }
});

describe("the forgot-password action", () => {
  it("prints a link to this machine whatever host the request claims", async () => {
    for (const name of ["RESEND_API_KEY", "SMTP_URL", "EMAIL_FROM", "APP_URL"]) vi.stubEnv(name, "");
    vi.stubEnv("PORT", "3100");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    requestHeaders.current = new Headers({
      host: "203.0.113.5:3000",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "https",
    });

    expect(await forgotPasswordAction({}, form({ email: user.email }))).toEqual({ submitted: { delivery: "console" } });
    await Promise.all(deferred);

    const printed = log.mock.calls.map((call) => String(call[0])).join("\n");
    expect(printed).toMatch(/http:\/\/localhost:3100\/reset-password\?token=[A-Za-z0-9_-]{43}/);
    expect(printed).not.toContain("evil.example");
    expect(printed).not.toContain("203.0.113.5");
  });
});

describe("the reset action", () => {
  it("resets, drops the link's cookie and signs this device in", async () => {
    const token = await issueToken(user.email);
    jar.set(RESET_TOKEN_COOKIE.name, token);

    const outcome = resetPasswordAction({}, form({ token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }));

    expect(await redirectedTo(outcome)).toBe("/app");
    expect(jar.has(RESET_TOKEN_COOKIE.name)).toBe(false);
    expect(jar.has(SESSION_COOKIE)).toBe(true);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    expect(await verifyPassword(NEW_PASSWORD, await getPasswordHash(user.id))).toBe(true);
  });

  it("shows the invalid-link state for a link that died after the page loaded, typo or not", async () => {
    const superseded = await issueToken(user.email);
    await issueToken(user.email);

    for (const [password, confirmPassword] of [
      ["short", "short"],
      [NEW_PASSWORD, `${NEW_PASSWORD}!`],
      [NEW_PASSWORD, NEW_PASSWORD],
    ] as const) {
      expect(await resetPasswordAction({}, form({ token: superseded, password, confirmPassword }))).toEqual({
        invalid: true,
      });
    }
  });
});

describe("opening the emailed link", () => {
  const TOKEN = "T".repeat(43);
  const open = (query: string, headers: Record<string, string> = {}) =>
    openResetLink(new NextRequest(`http://localhost:3000/reset-password${query}`, { headers }));

  it("moves the token out of the address and into a cookie for the form", () => {
    const response = open(`?token=${TOKEN}`);

    expect(response.status).toBe(303);
    // Relative, and without the token: the page the form lives on can load
    // whatever it likes without a Referer repeating the token.
    expect(response.headers.get("location")).toBe("/reset-password/new");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const [cookie] = response.headers.getSetCookie();
    expect(cookie).toContain(`${RESET_TOKEN_COOKIE.name}=${TOKEN}`);
    expect(cookie).toMatch(/Path=\/reset-password(;|$)/);
    expect(cookie).toMatch(/Max-Age=1800/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  it("marks the cookie Secure when the link was opened over HTTPS", () => {
    expect(open(`?token=${TOKEN}`, { "x-forwarded-proto": "https" }).headers.getSetCookie()[0]).toMatch(/Secure/);
    expect(open(`?token=${TOKEN}`, { "x-forwarded-proto": "http" }).headers.getSetCookie()[0]).not.toMatch(/Secure/);
  });

  it("clears any earlier link's token for a link that is not one", () => {
    for (const query of ["", "?token=", "?token=not-a-token", `?token=${TOKEN}&token=${TOKEN}`, `?token=%20${TOKEN}`]) {
      const response = open(query);

      expect(response.status, query).toBe(303);
      expect(response.headers.get("location"), query).toBe("/reset-password/new");
      const [cookie] = response.headers.getSetCookie();
      expect(cookie, query).toMatch(new RegExp(`^${RESET_TOKEN_COOKIE.name}=;`));
      expect(cookie, query).toMatch(/Path=\/reset-password(;|$)/);
      expect(cookie, query).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
    }
  });
});
