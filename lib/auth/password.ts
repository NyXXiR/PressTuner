import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

function isScryptHash(value: string) {
  return value.startsWith("scrypt$");
}

export async function hashPassword(plain: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    Buffer.from(hash).toString("base64"),
  ].join("$");
}

export async function verifyPassword(plain: string, stored: string) {
  if (!stored) return { ok: false, needsUpgrade: false };
  if (!isScryptHash(stored)) {
    return { ok: stored === plain, needsUpgrade: stored === plain };
  }

  const parts = stored.split("$");
  if (parts.length !== 6) return { ok: false, needsUpgrade: false };

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return { ok: false, needsUpgrade: false };
  }

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(plain, salt, expected.length, { N: n, r, p });
  if (actual.length !== expected.length) {
    return { ok: false, needsUpgrade: false };
  }

  return {
    ok: timingSafeEqual(actual, expected),
    needsUpgrade: false,
  };
}
