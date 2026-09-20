import "server-only";

import { DEFAULT_CATEGORIES } from "@/config/categories";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "./password";

/**
 * Account creation.
 *
 * A user is only useful with a `UserStats` row and something to file tasks
 * under, so all three are written in one transaction: a half-created account
 * would otherwise surface as a crash on first dashboard load.
 */
export interface CreateUserInput {
  readonly email: string;
  readonly password: string;
  readonly name: string;
  readonly timezone: string;
}

export class EmailTakenError extends Error {
  constructor() {
    super("An account with that email already exists.");
    this.name = "EmailTakenError";
  }
}

export async function createUser(input: CreateUserInput): Promise<{ id: string }> {
  const passwordHash = await hashPassword(input.password);

  // Checked before the transaction for a clean message, and again by the
  // unique index below — the index is what actually guarantees uniqueness
  // under concurrent sign-ups.
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new EmailTakenError();

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
          timezone: input.timezone,
          stats: { create: {} },
          categories: {
            create: DEFAULT_CATEGORIES.map((category) => ({
              name: category.name,
              color: category.color,
            })),
          },
        },
        select: { id: true },
      });
      return user;
    });
  } catch (error) {
    if (isUniqueViolation(error, "email")) throw new EmailTakenError();
    throw error;
  }
}

/**
 * Guarantees a `UserStats` row exists.
 *
 * Accounts created before this model existed — or by a partially failed
 * migration — would otherwise have none, and every read path would need a null
 * check. Cheap, idempotent, and keeps the rest of the code honest.
 */
export async function ensureUserStats(userId: string) {
  return prisma.userStats.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

function isUniqueViolation(error: unknown, field: string): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code !== "P2002") return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  return typeof target === "string" ? target.includes(field) : true;
}
