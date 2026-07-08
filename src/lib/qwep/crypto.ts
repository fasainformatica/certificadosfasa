import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";

const TOKEN_HASH_PREFIX = "qwep-access-token:";
const SIGNING_SECRET_HASH_PREFIX = "qwep-signing-secret:";
const RESERVATION_TOKEN_HASH_PREFIX = "qwep-reservation-token:";

function base64UrlSecret(prefix: string) {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

function hashWithPrefix(prefix: string, value: string) {
  return createHash("sha256").update(`${prefix}${value.trim()}`).digest("hex");
}

export function hashDeviceToken(token: string) {
  return hashWithPrefix(TOKEN_HASH_PREFIX, token);
}

export function hashSigningSecret(secret: string) {
  return hashWithPrefix(SIGNING_SECRET_HASH_PREFIX, secret);
}

export function hashReservationToken(token: string) {
  return hashWithPrefix(RESERVATION_TOKEN_HASH_PREFIX, token);
}

export function generateDeviceCredentials() {
  const token = base64UrlSecret("qwep_live");
  const signingSecret = base64UrlSecret("qwep_sig");
  const encrypted = encryptSecret(signingSecret);

  return {
    token,
    signingSecret,
    tokenHash: hashDeviceToken(token),
    signingSecretHash: hashSigningSecret(signingSecret),
    signingSecretCiphertext: encrypted.ciphertext,
    signingSecretIv: encrypted.iv,
    signingSecretAuthTag: encrypted.authTag,
  };
}

export function decryptSigningSecret(secret: {
  signing_secret_ciphertext: string;
  signing_secret_iv: string;
  signing_secret_auth_tag: string;
}) {
  return decryptSecret({
    ciphertext: secret.signing_secret_ciphertext,
    iv: secret.signing_secret_iv,
    authTag: secret.signing_secret_auth_tag,
  });
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createQwepSignature({
  method,
  pathname,
  timestamp,
  nonce,
  bodyHash,
  signingSecret,
}: {
  method: string;
  pathname: string;
  timestamp: string;
  nonce: string;
  bodyHash: string;
  signingSecret: string;
}) {
  const canonical = [method.toUpperCase(), pathname, timestamp, nonce, bodyHash].join("\n");

  return createHmac("sha256", signingSecret).update(canonical).digest("hex");
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
