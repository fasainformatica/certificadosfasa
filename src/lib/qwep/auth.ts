import "server-only";

import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createQwepSignature,
  decryptSigningSecret,
  hashDeviceToken,
  safeEqual,
  sha256Hex,
} from "@/lib/qwep/crypto";
import { getClientIp } from "@/lib/qwep/rate-limit";

export type QwepDevice = {
  id: string;
  name: string;
  token_hash: string;
  signing_secret_hash: string;
  signing_secret_ciphertext: string;
  signing_secret_iv: string;
  signing_secret_auth_tag: string;
  status: "created" | "pending_activation" | "active" | "disconnected" | "error" | "revoked" | "expired";
  is_primary_sender: boolean;
  connected_phone: string | null;
  browser_name: string | null;
  user_agent: string | null;
  app_version: string | null;
  last_seen_at: string | null;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
};

type AuthSuccess = {
  ok: true;
  device: QwepDevice;
};

type AuthFailure = {
  ok: false;
  response: NextResponse;
};

function unauthorized(message = "Credenciais invalidas.", status = 401): AuthFailure {
  return {
    ok: false,
    response: NextResponse.json({ error: message }, { status }),
  };
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

function validateTimestamp(timestamp: string | null) {
  if (!timestamp || !/^\d+$/.test(timestamp)) {
    return false;
  }

  const requestTime = Number(timestamp);
  const driftMs = Math.abs(Date.now() - requestTime);

  return Number.isFinite(requestTime) && driftMs <= 5 * 60 * 1000;
}

async function checkPersistentRateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();

  const { data } = await admin.from("qwep_rate_limit_buckets").select("*").eq("key", key).maybeSingle();

  if (!data || new Date(data.reset_at).getTime() <= now.getTime()) {
    await admin.from("qwep_rate_limit_buckets").upsert(
      {
        key,
        count: 1,
        reset_at: new Date(now.getTime() + windowMs).toISOString(),
      },
      { onConflict: "key" },
    );

    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (data.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((new Date(data.reset_at).getTime() - now.getTime()) / 1000),
    };
  }

  await admin.from("qwep_rate_limit_buckets").update({ count: data.count + 1, updated_at: nowIso }).eq("key", key);

  return { allowed: true, retryAfterSeconds: 0 };
}

async function rememberPersistentNonce({
  deviceId,
  timestamp,
  nonce,
}: {
  deviceId: string;
  timestamp: string;
  nonce: string;
}) {
  const admin = createSupabaseAdminClient();
  const now = Date.now();
  const nonceHash = sha256Hex(`${deviceId}:${timestamp}:${nonce}`);

  const { error } = await admin.from("qwep_seen_nonces").insert({
    nonce_hash: nonceHash,
    device_id: deviceId,
    expires_at: new Date(now + 5 * 60 * 1000).toISOString(),
  });

  return !error;
}

async function validateHmac({
  request,
  bodyText,
  signingSecret,
  deviceId,
}: {
  request: Request;
  bodyText: string;
  signingSecret: string;
  deviceId: string;
}) {
  const version = request.headers.get("x-qwep-version");
  const timestamp = request.headers.get("x-qwep-timestamp");
  const nonce = request.headers.get("x-qwep-nonce");
  const signature = request.headers.get("x-qwep-signature");
  const bodyHash = request.headers.get("x-qwep-body-sha256");

  if (version !== "1" || !timestamp || !nonce || !signature || !bodyHash) {
    return false;
  }

  if (!validateTimestamp(timestamp) || !safeEqual(bodyHash, sha256Hex(bodyText))) {
    return false;
  }

  const nonceAccepted = await rememberPersistentNonce({ deviceId, timestamp, nonce });

  if (!nonceAccepted) {
    return false;
  }

  const url = new URL(request.url);
  const expectedSignature = createQwepSignature({
    method: request.method,
    pathname: url.pathname,
    timestamp,
    nonce,
    bodyHash,
    signingSecret,
  });

  return safeEqual(signature, expectedSignature);
}

export async function authenticateQwepRequest(
  request: Request,
  {
    bodyText = "",
    requirePrimarySender = false,
    rateLimitKey = "qwep",
  }: {
    bodyText?: string;
    requirePrimarySender?: boolean;
    rateLimitKey?: string;
  } = {},
): Promise<AuthSuccess | AuthFailure> {
  const token = getBearerToken(request);

  if (!token) {
    return unauthorized();
  }

  const tokenHash = hashDeviceToken(token);
  const rateLimit = await checkPersistentRateLimit({
    key: `${rateLimitKey}:${getClientIp(request)}:${tokenHash}`,
    limit: 60,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "rate_limited", retry_after_seconds: rateLimit.retryAfterSeconds },
        { status: 429 },
      ),
    };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("whatsapp_devices").select("*").eq("token_hash", tokenHash).maybeSingle();

  if (error || !data) {
    return unauthorized();
  }

  const device = data as QwepDevice;

  if (["revoked", "expired"].includes(device.status)) {
    return unauthorized("Dispositivo bloqueado.", 403);
  }

  if (requirePrimarySender && !device.is_primary_sender) {
    return unauthorized("Dispositivo nao e emissor principal.", 403);
  }

  const signingSecret = decryptSigningSecret(device);
  const validHmac = await validateHmac({
    request,
    bodyText,
    signingSecret,
    deviceId: device.id,
  });

  if (!validHmac) {
    return unauthorized("Assinatura QWEP invalida.", 401);
  }

  return { ok: true, device };
}
