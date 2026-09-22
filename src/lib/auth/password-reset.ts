import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { APP_NAME } from "@/config/app";
import { buildResetLink, resolveEmailProvider, resolveLinkBase, type EmailEnv } from "@/lib/email/config";
import { renderPasswordResetEmail } from "@/lib/email/templates";
import { createEmailTransport, formatConsoleNotice, type EmailTransport } from "@/lib/email/transport";
import { prisma } from "@/lib/prisma";
import {
  isWellFormedResetToken,
  normalizeEmail,
  RESET_LINK_TTL_MINUTES,
  validateResetPassword,
} from "@/lib/validation/auth";
import type { FieldErrors } from "@/lib/validation/result";
import { hashPassword } from "./password";

/**
 * Forgotten-password recovery.
 *
 * The emailed link carries a high-entropy random token; the database stores
 * only a keyed hash of it, exactly as sessions do. Everything here is written
 * around two properties:
 *
 * - **Nothing observable depends on whether an account exists.** The request
 *   returns the same outcome for every well-formed address, and all the work
 *   that differs — the lookup, the token, the email — runs after the response
 *   has been sent, so not even its timing can tell a registered address from
 *   an unregistered one.
 * - **A link works once.** Redemption is a compare-and-swap on the token row,
 *   so two submissions of the same link race for one row and only one can win.
 */

export const RESET_TOKEN_TTL_MS = RESET_LINK_TTL_MINUTES * 60 * 1000;
/** At most this many links per account per rolling window. */
export const RESET_REQUESTS_PER_WINDOW = 3;
export const RESET_REQUEST_WINDOW_MS = 60 * 60 * 1000;

const TOKEN_BYTES = 32;

/**
 * Carries a reset token from the emailed link to the page that uses it.
 *
 * The link lands on a route handler that moves the token into this cookie and
 * redirects to an address without it (see app/(auth)/reset-password/route.ts),
 * so the page the token is typed into never has it in its URL — where every
 * stylesheet and script the page loads would repeat it in a Referer header.
 * Scoped to the reset pages and to the link's own lifetime.
 */
export const RESET_TOKEN_COOKIE = {
  name: "nova_reset",
  path: "/reset-password",
  maxAgeSeconds: RESET_LINK_TTL_MINUTES * 60,
} as const;

/**
 * Separates reset-token hashes from every other hash derived from the same
 * secret. Session hashes are computed differently again (see session.ts), so a
 * value that is valid as one can never be looked up as the other.
 */
const TOKEN_HASH_DOMAIN = "password-reset/v1";

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set to a random string of at least 32 characters. See .env.example.",
    );
  }
  return secret;
}

/**
 * HMAC-SHA-256 keyed with the app secret.
 *
 * Keyed, so a copy of the table alone cannot even confirm a guessed token, and
 * rotating the secret invalidates every outstanding link along with every
 * session.
 */
export function hashResetToken(token: string): string {
  return createHmac("sha256", getAuthSecret()).update(`${TOKEN_HASH_DOMAIN}:${token}`).digest("hex");
}

// ---------------------------------------------------------------------------
// Requesting a link
// ---------------------------------------------------------------------------

export type ResetTokenIssue =
  | {
      readonly status: "issued";
      /** The raw token. It goes into the link and is never written anywhere. */
      readonly token: string;
      readonly userId: string;
      readonly email: string;
      readonly expiresAt: Date;
    }
  /** The account has used up its hourly allowance; nothing was created. */
  | { readonly status: "rate-limited"; readonly email: string }
  | { readonly status: "no-account" };

/**
 * Creates a reset token for the account behind `email`.
 *
 * The refusals are told apart only so that the operator's terminal can say why
 * nothing was printed. The one caller that faces the outside world reports
 * none of them: to the visitor, all three outcomes look the same.
 */
export async function issuePasswordResetToken(email: string, now: Date = new Date()): Promise<ResetTokenIssue> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true, email: true },
  });
  if (!user) return { status: "no-account" };

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS);
  const windowStart = new Date(now.getTime() - RESET_REQUEST_WINDOW_MS);

  const issued = await prisma.$transaction(async (tx) => {
    // Serialise issuance per account. Without the lock, simultaneous requests
    // could each count two recent tokens and each insert a third, and the
    // limit would only hold for requests that politely arrive one at a time.
    // NO KEY UPDATE rather than UPDATE: it still excludes a second issuer, but
    // does not block rows elsewhere that merely reference this user.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR NO KEY UPDATE`;

    // Tokens older than the window can no longer work (they expire long
    // before) and no longer count, so this is the natural moment to drop them.
    await tx.passwordResetToken.deleteMany({
      where: { userId: user.id, createdAt: { lt: windowStart } },
    });

    const recent = await tx.passwordResetToken.count({
      where: { userId: user.id, createdAt: { gte: windowStart } },
    });
    if (recent >= RESET_REQUESTS_PER_WINDOW) return false;

    // Only the newest link works. Superseded tokens are expired rather than
    // deleted so that they keep counting towards the limit above.
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });

    await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashResetToken(token), expiresAt, createdAt: now },
    });
    return true;
  });

  if (!issued) return { status: "rate-limited", email: user.email };
  return { status: "issued", token, userId: user.id, email: user.email, expiresAt };
}

/**
 * What the person who asked is told. It depends on how this server sends
 * links, never on the address they typed.
 */
export type PasswordResetRequestOutcome =
  | { readonly status: "accepted"; readonly delivery: "email" | "console" }
  | { readonly status: "unavailable" };

export interface RequestPasswordResetOptions {
  /**
   * Runs work after the response has gone out. The Server Action passes
   * Next's `after`; tests pass a function that collects the promise.
   */
  readonly defer: (task: () => Promise<void>) => void;
  readonly env?: EmailEnv;
  /** Replaces the transport the environment would select. For tests. */
  readonly transport?: EmailTransport;
  readonly now?: Date;
}

/**
 * Accepts a forgot-password request.
 *
 * Returns before anything account-specific has happened. Configuration is
 * checked first and synchronously — it is the same for every address, so
 * reporting it leaks nothing — and everything else is handed to `defer`.
 */
export function requestPasswordReset(
  email: string,
  options: RequestPasswordResetOptions,
): PasswordResetRequestOutcome {
  const env: EmailEnv = options.env ?? {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    SMTP_URL: process.env.SMTP_URL,
    EMAIL_FROM: process.env.EMAIL_FROM,
    APP_URL: process.env.APP_URL,
    PORT: process.env.PORT,
  };

  const provider = resolveEmailProvider(env);
  if (!provider.ok) {
    console.error(`[auth] password reset email is misconfigured: ${provider.problem}`);
    return { status: "unavailable" };
  }

  const base = resolveLinkBase(env, provider.value);
  if (!base.ok) {
    console.error(`[auth] refusing to send a password reset link: ${base.problem}`);
    return { status: "unavailable" };
  }

  const transport = options.transport ?? createEmailTransport(provider.value);
  const now = options.now ?? new Date();
  const linkBase = base.value;

  options.defer(async () => {
    try {
      const issued = await issuePasswordResetToken(email, now);
      // Without this, a refused request prints nothing at all while the page
      // still says a link was printed — and the newest banner in the terminal
      // would be whichever request last got through, perhaps not the
      // operator's own. Nothing is emailed about it: that would make the
      // limit a way to send mail.
      if (issued.status === "rate-limited" && transport.kind === "console") {
        console.log(formatRateLimitNotice(issued.email));
      }
      if (issued.status !== "issued") return;

      const message = renderPasswordResetEmail({
        appName: APP_NAME,
        link: buildResetLink(linkBase, issued.token),
        expiresInMinutes: RESET_LINK_TTL_MINUTES,
      });
      await transport.send({ to: issued.email, ...message });
    } catch (error) {
      // Nobody is waiting on this any more, so the log is the only place a
      // failure can go. The token row may exist without an email having left;
      // it simply expires unused.
      console.error("[auth] password reset request could not be completed", error);
    }
  });

  return { status: "accepted", delivery: provider.value.kind === "console" ? "console" : "email" };
}

function formatRateLimitNotice(email: string): string {
  return formatConsoleNotice("NO RESET LINK PRINTED — too many requests for this account.", [
    `Account: ${email}`,
    "",
    `It has asked for ${RESET_REQUESTS_PER_WINDOW} links in the past hour, so this request made`,
    "no new one. The newest link printed above for this account is still",
    `the one that works, until it is used or ${RESET_LINK_TTL_MINUTES} minutes after it was printed.`,
    "If nobody here asked for these, someone else is requesting them.",
  ]);
}

// ---------------------------------------------------------------------------
// Redeeming a link
// ---------------------------------------------------------------------------

/**
 * Whether a link would currently work, and for which address.
 *
 * Read-only, so a mail scanner or link preview that fetches the page does not
 * burn the token. The answer can go stale a moment later; the redemption
 * below re-checks it atomically and is the only check that grants anything.
 */
export async function findUsableResetToken(
  token: string,
  now: Date = new Date(),
): Promise<{ readonly email: string } | null> {
  if (!isWellFormedResetToken(token)) return null;

  const row = await prisma.passwordResetToken.findFirst({
    where: { tokenHash: hashResetToken(token), usedAt: null, expiresAt: { gt: now } },
    select: { user: { select: { email: true } } },
  });
  return row ? { email: row.user.email } : null;
}

export type ResetPasswordResult =
  | { readonly status: "reset"; readonly userId: string }
  /** Unknown, expired, used or superseded — deliberately indistinguishable. */
  | { readonly status: "invalid-link" }
  | { readonly status: "invalid-input"; readonly errors: FieldErrors };

/**
 * Redeems a reset link for a new password, confirmation included.
 *
 * The one entry point for resetting: the new password is held to sign-up's
 * rules and must match its confirmation before the link is spent, so a typo
 * costs nothing and leaves the link usable.
 *
 * A dead link outranks a typo, though. It can never become valid, so asking
 * someone to fix their password only to tell them afterwards that the link had
 * expired while they typed, or been superseded by a newer one, wastes their
 * effort. A malformed token is dead on sight; a well-formed one gets the same
 * read-only check the page makes on arrival — one indexed read, no hashing.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
  confirmPassword: string,
  now: Date = new Date(),
): Promise<ResetPasswordResult> {
  const input = validateResetPassword({ token, password: newPassword, confirmPassword });
  if (!input.ok) {
    if (input.errors.token || !(await findUsableResetToken(token.trim(), now))) return { status: "invalid-link" };
    return { status: "invalid-input", errors: input.errors };
  }

  const outcome = await resetPasswordWithToken(input.data.token, input.data.password, now);
  return outcome.ok ? { status: "reset", userId: outcome.userId } : { status: "invalid-link" };
}

export type ResetPasswordOutcome = { readonly ok: true; readonly userId: string } | { readonly ok: false };

/**
 * Sets a new password through a reset link.
 *
 * The account is whichever one the token row belongs to — nothing from the
 * request names it — so a token can only ever change its own user's password.
 * On success, in one transaction: the new hash is stored, the token is spent,
 * every other outstanding token for the account stops working, and every
 * session is revoked, so whoever knew the old password is signed out
 * everywhere.
 *
 * `newPassword` must already have passed `validateResetPassword`; callers
 * outside this module go through `resetPassword`, which sees to that.
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
  now: Date = new Date(),
): Promise<ResetPasswordOutcome> {
  if (!isWellFormedResetToken(token)) return { ok: false };

  const tokenHash = hashResetToken(token);

  // A cheap read first, so a dead link is turned away before paying for
  // scrypt. It grants nothing: the swap below is what decides.
  const candidate = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    select: { id: true },
  });
  if (!candidate) return { ok: false };

  // Hashed outside the transaction: scrypt takes a noticeable fraction of a
  // second, and holding row locks for that long would stall other writers.
  const passwordHash = await hashPassword(newPassword);

  return prisma.$transaction(async (tx) => {
    // The compare-and-swap. The unused-and-unexpired predicate is re-checked
    // by the UPDATE itself, under the row lock, so of any number of concurrent
    // submissions exactly one sees count === 1; the rest find the row already
    // spent and change nothing.
    const swap = await tx.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (swap.count !== 1) return { ok: false } as const;

    const spent = await tx.passwordResetToken.findUniqueOrThrow({
      where: { tokenHash },
      select: { id: true, userId: true },
    });

    // The user row is rewritten before sessions are deleted, and its lock is
    // held until commit. `isPasswordHashCurrent` depends on that order to keep
    // a sign-in that checked the old password from outliving this reset.
    await tx.user.update({ where: { id: spent.userId }, data: { passwordHash } });

    // Expired rather than deleted, exactly as issuance supersedes a link: the
    // rows are what the hourly limit counts, and deleting them would hand a
    // fresh allowance to whoever has just reset.
    await tx.passwordResetToken.updateMany({
      where: { userId: spent.userId, id: { not: spent.id }, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });

    await tx.session.deleteMany({ where: { userId: spent.userId } });

    return { ok: true, userId: spent.userId } as const;
  });
}

// ---------------------------------------------------------------------------
// Signing in around a reset
// ---------------------------------------------------------------------------

/**
 * Whether the account's stored password hash is still one of `verified` — the
 * hashes a sign-in has just checked the typed password against.
 *
 * Sign-in reads the hash, spends a noticeable fraction of a second in scrypt,
 * and only then creates a session. A reset that commits in that gap deletes
 * every session that exists at that moment, but not one inserted a moment
 * later. An attacker who kept signing in with the stolen old password would
 * nearly always have a sign-in in flight, and would stay signed in after the
 * reset that was meant to lock them out. So sign-in calls this once its
 * session exists, and throws the session away unless the hash it checked is
 * still the one stored.
 *
 * `FOR SHARE` is what makes the check airtight. `resetPasswordWithToken`
 * rewrites the user row before deleting sessions and holds the row's lock
 * until it commits, and a share lock cannot be taken while that is held. So
 * this read either comes first — and the reset's delete, which starts later
 * still, sees the new session — or it waits for the reset to commit and reads
 * the new hash. It cannot read the old hash and have its session survive.
 */
export async function isPasswordHashCurrent(userId: string, verified: readonly string[]): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ passwordHash: string }[]>`
    SELECT "passwordHash" FROM "User" WHERE "id" = ${userId} FOR SHARE
  `;
  const current = rows[0]?.passwordHash;
  return current !== undefined && verified.includes(current);
}
