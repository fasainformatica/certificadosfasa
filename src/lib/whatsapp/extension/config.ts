import "server-only";

import { timingSafeEqual } from "crypto";

import { NextResponse } from "next/server";

import { getOptionalEnv } from "@/lib/supabase/env";
import { WHATSAPP_EXTENSION_PROVIDER } from "@/lib/whatsapp/providers";

const ALLOWED_WEB_ORIGINS = new Set([
  "https://web.whatsapp.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);

export type WhatsAppExtensionConfigStatus = {
  enabled: boolean;
  tokenConfigured: boolean;
  activeProvider: boolean;
};

export type WhatsAppExtensionAuthContext = {
  connectedNumber: string;
  extensionVersion: string | null;
};

export type WhatsAppExtensionAuthResult =
  | {
      ok: true;
      context: WhatsAppExtensionAuthContext;
    }
  | {
      ok: false;
      status: number;
      code: number;
      message: string;
    };

function readBooleanFlag(name: string, fallback = false) {
  const raw = getOptionalEnv(name);

  if (!raw) {
    return fallback;
  }

  return ["1", "true", "yes", "sim"].includes(raw.trim().toLowerCase());
}

function getConfiguredToken() {
  return getOptionalEnv("WHATSAPP_EXTENSION_TOKEN") ?? getOptionalEnv("WHATSAPP_EXTENSION_API_TOKEN");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseBasicAuth(value: string | null) {
  if (!value?.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = Buffer.from(value.slice("Basic ".length), "base64").toString("utf8");
    const firstSeparator = decoded.indexOf(":");
    const lastSeparator = decoded.lastIndexOf(":");

    if (firstSeparator < 0 || lastSeparator <= firstSeparator) {
      return null;
    }

    return {
      connectedNumber: decoded.slice(0, firstSeparator),
      token: decoded.slice(firstSeparator + 1, lastSeparator),
      extensionVersion: decoded.slice(lastSeparator + 1) || null,
    };
  } catch {
    return null;
  }
}

export function getWhatsAppExtensionConfigStatus(): WhatsAppExtensionConfigStatus {
  return {
    enabled: readBooleanFlag("WHATSAPP_EXTENSION_ENABLED"),
    tokenConfigured: Boolean(getConfiguredToken()),
    activeProvider: getOptionalEnv("WHATSAPP_PROVIDER")?.trim().toLowerCase() === WHATSAPP_EXTENSION_PROVIDER,
  };
}

export function authenticateWhatsAppExtension(request: Request): WhatsAppExtensionAuthResult {
  const config = getWhatsAppExtensionConfigStatus();
  const configuredToken = getConfiguredToken();

  if (!config.enabled) {
    return {
      ok: false,
      status: 401,
      code: 401,
      message: "Integracao da extensao do WhatsApp desativada.",
    };
  }

  if (!configuredToken) {
    return {
      ok: false,
      status: 401,
      code: 401,
      message: "Token da extensao do WhatsApp nao configurado no servidor.",
    };
  }

  const credentials = parseBasicAuth(request.headers.get("authorization"));

  if (!credentials || !safeEqual(credentials.token, configuredToken)) {
    return {
      ok: false,
      status: 401,
      code: 401,
      message: "Token da extensao do WhatsApp invalido.",
    };
  }

  return {
    ok: true,
    context: {
      connectedNumber: credentials.connectedNumber,
      extensionVersion: credentials.extensionVersion,
    },
  };
}

export function getWhatsAppExtensionCorsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowOrigin =
    origin && (ALLOWED_WEB_ORIGINS.has(origin) || origin.startsWith("chrome-extension://")) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

export function extensionOptions(request: Request) {
  return new Response(null, {
    status: 204,
    headers: getWhatsAppExtensionCorsHeaders(request),
  });
}

export function extensionJson(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: getWhatsAppExtensionCorsHeaders(request),
  });
}

export function extensionError(request: Request, auth: Extract<WhatsAppExtensionAuthResult, { ok: false }>) {
  return extensionJson(request, { error: auth.message, code: auth.code }, auth.status);
}
