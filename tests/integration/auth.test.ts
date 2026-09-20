import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import { createUser, EmailTakenError, ensureUserStats } from "@/lib/auth/users";
import { db, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

describe("password hashing", () => {
  it("accepts the correct password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(await verifyPassword("wrong-horse-battery", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("never stores the password itself", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash).not.toContain("correct-horse-battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
  });

  it("salts, so identical passwords produce different hashes", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("handles unicode and very long passwords", async () => {
    const unicode = "пароль-🔐-密码";
    expect(await verifyPassword(unicode, await hashPassword(unicode))).toBe(true);

    const long = "x".repeat(200);
    expect(await verifyPassword(long, await hashPassword(long))).toBe(true);
  });

  it("returns false rather than throwing on a corrupted hash", async () => {
    for (const bad of ["", "not-a-hash", "scrypt$1$2$3", "scrypt$abc$8$1$c2FsdA==$aGFzaA==", "$$$$$"]) {
      expect(await verifyPassword("anything", bad)).toBe(false);
    }
  });

  it("rejects absurd stored parameters instead of burning memory on them", async () => {
    // A tampered row asking for N=2^30 would otherwise be a denial-of-service.
    const hostile = `scrypt$${2 ** 30}$8$1$c2FsdA==$aGFzaA==`;
    expect(await verifyPassword("anything", hostile)).toBe(false);
  });

  it("does not flag a freshly created hash for rehashing", async () => {
    expect(needsRehash(await hashPassword("password123"))).toBe(false);
  });

  it("flags weaker or malformed hashes for upgrade", async () => {
    expect(needsRehash("scrypt$1024$8$1$c2FsdA==$aGFzaA==")).toBe(true);
    expect(needsRehash("garbage")).toBe(true);
  });
});

describe("account creation", () => {
  it("creates the user with stats and starter categories in one go", async () => {
    const { id } = await createUser({
      email: "ada@example.test",
      password: "correct-horse-battery",
      name: "Ada",
      timezone: "Europe/Berlin",
    });

    const user = await db.user.findUniqueOrThrow({
      where: { id },
      include: { stats: true, categories: true },
    });

    expect(user.email).toBe("ada@example.test");
    expect(user.timezone).toBe("Europe/Berlin");
    expect(user.stats).not.toBeNull();
    expect(user.stats?.totalXp).toBe(0);
    expect(user.stats?.level).toBe(1);
    expect(user.stats?.currentStreak).toBe(0);
    expect(user.categories.length).toBeGreaterThan(0);
  });

  it("stores a verifiable hash, not the password", async () => {
    await createUser({
      email: "ada@example.test",
      password: "correct-horse-battery",
      name: "Ada",
      timezone: "UTC",
    });

    const user = await db.user.findUniqueOrThrow({ where: { email: "ada@example.test" } });
    expect(user.passwordHash).not.toContain("correct-horse-battery");
    expect(await verifyPassword("correct-horse-battery", user.passwordHash)).toBe(true);
  });

  it("refuses a duplicate email", async () => {
    const input = {
      email: "ada@example.test",
      password: "correct-horse-battery",
      name: "Ada",
      timezone: "UTC",
    };
    await createUser(input);
    await expect(createUser(input)).rejects.toBeInstanceOf(EmailTakenError);
    expect(await db.user.count({ where: { email: "ada@example.test" } })).toBe(1);
  });

  it("lets two accounts share a category name without colliding", async () => {
    const first = await createUser({ email: "a@example.test", password: "correct-horse-battery", name: "A", timezone: "UTC" });
    const second = await createUser({ email: "b@example.test", password: "correct-horse-battery", name: "B", timezone: "UTC" });

    const firstNames = await db.category.findMany({ where: { userId: first.id }, select: { name: true } });
    const secondNames = await db.category.findMany({ where: { userId: second.id }, select: { name: true } });
    expect(firstNames.map((c) => c.name).sort()).toEqual(secondNames.map((c) => c.name).sort());
  });

  it("leaves no partial account behind when creation fails", async () => {
    await createUser({ email: "ada@example.test", password: "correct-horse-battery", name: "Ada", timezone: "UTC" });
    const before = await db.user.count();

    await expect(
      createUser({ email: "ada@example.test", password: "another-password", name: "Impostor", timezone: "UTC" }),
    ).rejects.toThrow();

    expect(await db.user.count()).toBe(before);
    expect(await db.user.findUniqueOrThrow({ where: { email: "ada@example.test" } })).toMatchObject({ name: "Ada" });
  });
});

describe("ensureUserStats", () => {
  it("creates a missing stats row and is safe to call repeatedly", async () => {
    const user = await db.user.create({
      data: { email: "no-stats@example.test", name: "Legacy", passwordHash: await hashPassword("password123") },
    });
    expect(await db.userStats.findUnique({ where: { userId: user.id } })).toBeNull();

    await ensureUserStats(user.id);
    await ensureUserStats(user.id);

    expect(await db.userStats.count({ where: { userId: user.id } })).toBe(1);
  });

  it("does not reset existing progress", async () => {
    const user = await createUser({ email: "ada@example.test", password: "correct-horse-battery", name: "Ada", timezone: "UTC" });
    await db.userStats.update({ where: { userId: user.id }, data: { totalXp: 500, level: 3 } });

    await ensureUserStats(user.id);

    const stats = await db.userStats.findUniqueOrThrow({ where: { userId: user.id } });
    expect(stats.totalXp).toBe(500);
    expect(stats.level).toBe(3);
  });
});
