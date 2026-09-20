import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt is memory-hard and built in, so we get a modern KDF without adding a
 * native dependency. Parameters are stored *inside* the hash string, which
 * means they can be raised later and old hashes still verify — `needsRehash`
 * flags the stale ones so they can be upgraded on next successful login.
 */

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** ~64 MB of memory per hash: comfortably above brute-force economics. */
const PARAMS = { N: 2 ** 16, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/** scrypt needs roughly 128 * N * r bytes; give it headroom. */
const MAX_MEM = 256 * PARAMS.N * PARAMS.r;

const PREFIX = "scrypt";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM });

  return [PREFIX, PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), derived.toString("base64")].join("$");
}

/**
 * Constant-time verification.
 *
 * Returns `false` for malformed stored hashes rather than throwing, so a
 * corrupted row cannot turn a login attempt into a 500.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parsed = parseHash(storedHash);
  if (!parsed) return false;

  try {
    const derived = await scrypt(password.normalize("NFKC"), parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: 256 * parsed.N * parsed.r,
    });
    return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash);
  } catch {
    return false;
  }
}

/** True when a hash was produced with weaker parameters than we now use. */
export function needsRehash(storedHash: string): boolean {
  const parsed = parseHash(storedHash);
  if (!parsed) return true;
  return parsed.N < PARAMS.N || parsed.r < PARAMS.r || parsed.p < PARAMS.p;
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parseHash(stored: string): ParsedHash | null {
  if (typeof stored !== "string") return null;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== PREFIX) return null;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  // Reject absurd parameters from a tampered row — they would be a DoS vector.
  if (N < 2 || N > 2 ** 20 || r < 1 || r > 32 || p < 1 || p > 16) return null;

  try {
    const salt = Buffer.from(parts[4] as string, "base64");
    const hash = Buffer.from(parts[5] as string, "base64");
    if (salt.length === 0 || hash.length === 0) return null;
    return { N, r, p, salt, hash };
  } catch {
    return null;
  }
}

/**
 * Burns roughly the same time as a real verification.
 *
 * Called when no user matches the submitted email, so that response timing
 * does not reveal which addresses are registered.
 */
export async function fakeVerifyDelay(): Promise<void> {
  await scrypt("decoy", randomBytes(SALT_LENGTH), KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM });
}
