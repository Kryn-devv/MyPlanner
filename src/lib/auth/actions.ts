"use server";

import { redirect } from "next/navigation";
import { normalizeTimezone } from "@/lib/datetime";
import { prisma } from "@/lib/prisma";
import { validateProfile, validateSignIn, validateSignUp } from "@/lib/validation/auth";
import type { FieldErrors } from "@/lib/validation/result";
import { requireUser } from "./guard";
import { fakeVerifyDelay, hashPassword, needsRehash, verifyPassword } from "./password";
import { createSession, destroyAllSessions, destroySession } from "./session";
import { createUser, EmailTakenError, ensureUserStats } from "./users";

/**
 * Auth Server Actions.
 *
 * All of them return a plain serialisable state object consumed by
 * `useActionState`, so the forms work before hydration and report real errors
 * instead of failing silently.
 */
export interface AuthFormState {
  readonly errors?: FieldErrors;
  readonly values?: Record<string, string>;
}

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const result = validateSignUp(formData);

  // Echo back what was typed (never the password) so the form does not reset.
  const values = {
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") ?? ""),
  };

  if (!result.ok) return { errors: result.errors, values };

  let userId: string;
  try {
    const user = await createUser(result.data);
    userId = user.id;
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return { errors: { email: error.message }, values };
    }
    console.error("[auth] sign-up failed", error);
    return { errors: { _form: "We could not create your account. Please try again." }, values };
  }

  await createSession(userId);
  redirect("/app");
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const result = validateSignIn(formData);
  const values = { email: String(formData.get("email") ?? "") };

  if (!result.ok) return { errors: result.errors, values };

  const { email, password } = result.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      // Spend comparable time so response latency does not reveal whether the
      // address is registered.
      await fakeVerifyDelay();
      return { errors: { _form: "Incorrect email or password." }, values };
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return { errors: { _form: "Incorrect email or password." }, values };
    }

    // Transparently upgrade hashes created with older parameters.
    if (needsRehash(user.passwordHash)) {
      const upgraded = await hashPassword(password);
      await prisma.user
        .update({ where: { id: user.id }, data: { passwordHash: upgraded } })
        .catch((error: unknown) => console.error("[auth] rehash failed", error));
    }

    await ensureUserStats(user.id);
    await createSession(user.id);
  } catch (error) {
    console.error("[auth] sign-in failed", error);
    return { errors: { _form: "Something went wrong signing you in. Please try again." }, values };
  }

  redirect("/app");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export interface ProfileFormState {
  readonly errors?: FieldErrors;
  readonly success?: boolean;
}

export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();
  const result = validateProfile(formData);
  if (!result.ok) return { errors: result.errors };

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: result.data.name,
        timezone: normalizeTimezone(result.data.timezone),
      },
    });
  } catch (error) {
    console.error("[auth] profile update failed", error);
    return { errors: { _form: "We could not save your changes. Please try again." } };
  }

  return { success: true };
}

/** Signs every device out. Exposed in settings as "sign out everywhere". */
export async function signOutEverywhereAction(): Promise<void> {
  const user = await requireUser();
  await destroyAllSessions(user.id);
  redirect("/login");
}
