import "server-only";

import { createHash, randomBytes } from "crypto";

export function createPublicDownloadToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPublicDownloadToken(token: string) {
  return createHash("sha256").update(`fasa-download-token:${token}`).digest("hex");
}
