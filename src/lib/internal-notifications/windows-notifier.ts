import "server-only";

import { timingSafeEqual } from "crypto";

import type { UserRole } from "@/lib/supabase/database.types";
import { getOptionalEnv } from "@/lib/supabase/env";

const WINDOWS_NOTIFIER_ALLOWED_ROLES = ["admin", "financeiro"] as const satisfies readonly UserRole[];
const DEFAULT_WINDOWS_NOTIFIER_ROLE = "financeiro" satisfies UserRole;

export type WindowsNotifierConfigStatus = {
  enabled: boolean;
  tokenConfigured: boolean;
  role: UserRole;
};

export type WindowsNotifierAuthResult =
  | {
      ok: true;
      context: {
        role: UserRole;
      };
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

export type WindowsNotifierVisibilityFilters = {
  expiresAt: string;
  targetRole: string;
};

function readBooleanFlag(name: string, fallback = false) {
  const raw = getOptionalEnv(name);

  if (!raw) {
    return fallback;
  }

  return ["1", "true", "yes", "sim"].includes(raw.trim().toLowerCase());
}

function getConfiguredToken() {
  return getOptionalEnv("WINDOWS_NOTIFIER_TOKEN") ?? getOptionalEnv("INTERNAL_NOTIFIER_TOKEN");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function readWindowsNotifierRole(): UserRole {
  const raw = getOptionalEnv("WINDOWS_NOTIFIER_ROLE")?.trim().toLowerCase();

  if (WINDOWS_NOTIFIER_ALLOWED_ROLES.includes(raw as UserRole)) {
    return raw as UserRole;
  }

  return DEFAULT_WINDOWS_NOTIFIER_ROLE;
}

function parseBearerToken(value: string | null) {
  if (!value?.startsWith("Bearer ")) {
    return null;
  }

  return value.slice("Bearer ".length).trim();
}

export function getWindowsNotifierConfigStatus(): WindowsNotifierConfigStatus {
  return {
    enabled: readBooleanFlag("WINDOWS_NOTIFIER_ENABLED"),
    tokenConfigured: Boolean(getConfiguredToken()),
    role: readWindowsNotifierRole(),
  };
}

export function authenticateWindowsNotifier(request: Request): WindowsNotifierAuthResult {
  const config = getWindowsNotifierConfigStatus();
  const configuredToken = getConfiguredToken();

  if (!config.enabled) {
    return {
      ok: false,
      status: 401,
      code: "windows_notifier_disabled",
      message: "Notificador Windows desativado no servidor.",
    };
  }

  if (!configuredToken) {
    return {
      ok: false,
      status: 401,
      code: "windows_notifier_token_missing",
      message: "Token do notificador Windows nao configurado no servidor.",
    };
  }

  const token = parseBearerToken(request.headers.get("authorization"));

  if (!token || !safeEqual(token, configuredToken)) {
    return {
      ok: false,
      status: 401,
      code: "windows_notifier_token_invalid",
      message: "Token do notificador Windows invalido.",
    };
  }

  return {
    ok: true,
    context: {
      role: config.role,
    },
  };
}

export function buildWindowsNotifierVisibilityFilters(params: {
  role: UserRole;
  nowIso: string;
}): WindowsNotifierVisibilityFilters {
  return {
    expiresAt: `expires_at.is.null,expires_at.gt.${params.nowIso}`,
    targetRole: `target_role.is.null,target_role.eq.${params.role}`,
  };
}
