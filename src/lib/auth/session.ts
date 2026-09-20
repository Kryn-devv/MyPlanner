import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Opaque server-side sessions.
 *
 * The cookie holds a high-entropy random token; the database stores only its
 * SHA-256. A leaked database therefore does not hand an attacker live sessions.
 *
 * This module is the only place that knows *how* a user is authenticated.
 * Adding OAuth later means adding a new way to arrive at `createSession(userId)`
 * — nothing downstream of it changes.
 */

export const SESSION_COOKIE = "nova_session";

/** 30 days, refreshed on use, so an active user is never logged out mid-flow. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Only rewrite the expiry when more than a day has been used up. */
const SESSION_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

const TOKEN_BYTES = 32;

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
 * Tokens are hashed with the app secret mixed in, so hashes are not portable
 * between environments and rotating the secret invalidates every session.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(`${getAuthSecret()}:${token}`).digest("hex");
}

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly timezone: string;
}

/** Issues a session and sets the cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // `lax` still sends the cookie on top-level navigation, so links into the
    // app work, while blocking cross-site POSTs — CSRF protection for the
    // Server Actions that back every mutation.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Revokes the current session and clears the cookie. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    // deleteMany: a already-deleted session must not throw on sign-out.
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  cookieStore.delete(SESSION_COOKIE);
}

/** Revokes every session for a user — used when a password changes. */
export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/**
 * Resolves the signed-in user, or `null`.
 *
 * Wrapped in `cache()` so that a single render resolving the session in the
 * layout, the page and three components still hits the database once.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      lastUsedAt: true,
      tokenHash: true,
      user: { select: { id: true, email: true, name: true, timezone: true } },
    },
  });

  if (!session) return null;

  // Compare the looked-up hash in constant time as well. The unique index
  // already did an equality match, but this keeps the comparison uniform.
  const a = Buffer.from(session.tokenHash);
  const b = Buffer.from(tokenHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  await refreshSession(session.id, session.lastUsedAt);

  return session.user;
});

/**
 * Slides the expiry window forward for active users.
 *
 * Deliberately best-effort: this runs during render, where writing a cookie is
 * not allowed, and a failed bookkeeping write must never break a page.
 */
async function refreshSession(sessionId: string, lastUsedAt: Date): Promise<void> {
  if (Date.now() - lastUsedAt.getTime() < SESSION_REFRESH_THRESHOLD_MS) return;

  await prisma.session
    .update({
      where: { id: sessionId },
      data: { lastUsedAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    })
    .catch(() => undefined);
}

/** Housekeeping for expired rows. Phase 2 should run this on a schedule. */
export async function pruneExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return result.count;
}
