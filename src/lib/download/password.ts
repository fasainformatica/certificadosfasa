import "server-only";

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";

const KEY_LENGTH = 32;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function deriveKey(password: string, salt: string, keyLength: number, options: { N: number; r: number; p: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

export function createOneTimeDownloadPassword() {
  return randomBytes(18).toString("base64url");
}

export async function hashDownloadPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await deriveKey(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derivedKey.toString("base64url")}`;
}

export async function verifyDownloadPassword(password: string, storedHash: string) {
  const [algorithm, n, r, p, salt, hash] = storedHash.split("$");

  if (algorithm !== "scrypt" || !n || !r || !p || !salt || !hash) {
    return false;
  }

  const storedKey = Buffer.from(hash, "base64url");
  const derivedKey = await deriveKey(password, salt, storedKey.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });

  return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
}
