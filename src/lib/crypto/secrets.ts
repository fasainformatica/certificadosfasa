import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

function getEncryptionKey() {
  const encodedKey = process.env.CERT_ENCRYPTION_KEY;

  if (!encodedKey) {
    throw new Error("Variavel de ambiente obrigatoria ausente: CERT_ENCRYPTION_KEY");
  }

  const key = Buffer.from(encodedKey, "base64");

  if (key.length !== KEY_LENGTH) {
    throw new Error("CERT_ENCRYPTION_KEY deve conter exatamente 32 bytes em base64.");
  }

  return key;
}

export function encryptSecret(plainText: string): EncryptedSecret {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptSecret(secret: EncryptedSecret): string {
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(secret.iv, "base64"), {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
