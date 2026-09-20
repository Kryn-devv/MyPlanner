import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "./session";

/**
 * The single gate every protected server component and Server Action goes
 * through.
 *
 * Authorisation in this app is not middleware-based: middleware runs on the
 * edge, before the database is consulted, and is easy to bypass by adding a
 * route it does not match. Instead every entry point that reads or writes user
 * data calls `requireUser()` and then scopes its query by `user.id`. That makes
 * cross-user access a compile-time-visible mistake rather than a config gap.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For Server Actions, where redirecting mid-mutation is the wrong response. */
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}

export class UnauthorizedError extends Error {
  constructor(message = "You need to be signed in to do that.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Thrown when a row exists but belongs to somebody else. */
export class NotFoundError extends Error {
  constructor(message = "That item could not be found.") {
    super(message);
    this.name = "NotFoundError";
  }
}
