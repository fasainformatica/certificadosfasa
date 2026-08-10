import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { OPERATIONAL_ROLES } from "@/lib/auth/permissions";
import {
  buildBroadcastInternalNotificationPayload,
  createInternalNotification,
} from "@/lib/internal-notifications/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { InternalNotificationSeverity } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const ALLOWED_SEVERITIES = ["info", "success", "warning", "error"] as const satisfies readonly InternalNotificationSeverity[];
const ALLOWED_EXPIRATION_HOURS = [24, 168, 720] as const;
const DEFAULT_EXPIRATION_HOURS = 168;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseSeverity(value: unknown): InternalNotificationSeverity {
  return ALLOWED_SEVERITIES.includes(value as InternalNotificationSeverity)
    ? (value as InternalNotificationSeverity)
    : "info";
}

function parseExpirationHours(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return ALLOWED_EXPIRATION_HOURS.includes(parsed as (typeof ALLOWED_EXPIRATION_HOURS)[number])
    ? parsed
    : DEFAULT_EXPIRATION_HOURS;
}

function buildExpiresAt(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export async function POST(request: Request) {
  const auth = await requireApiUser(OPERATIONAL_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Nao foi possivel ler os dados do aviso.", 400, "broadcast_payload_invalido");
  }

  if (!isRecord(body)) {
    return jsonError("Dados do aviso invalidos.", 400, "broadcast_payload_invalido");
  }

  const title = readTrimmedString(body.title);
  const message = readTrimmedString(body.body);
  const severity = parseSeverity(body.severity);
  const expirationHours = parseExpirationHours(body.expiresInHours);

  if (title.length < 3 || title.length > 120) {
    return jsonError("Informe um titulo entre 3 e 120 caracteres.", 400, "broadcast_titulo_invalido");
  }

  if (message.length < 3 || message.length > 500) {
    return jsonError("Informe uma mensagem entre 3 e 500 caracteres.", 400, "broadcast_mensagem_invalida");
  }

  const admin = createSupabaseAdminClient();
  const result = await createInternalNotification(
    admin,
    buildBroadcastInternalNotificationPayload({
      title,
      body: message,
      severity,
      actorUserId: auth.user.id,
      expiresAt: buildExpiresAt(expirationHours),
    }),
  );

  if (!result.created) {
    return jsonError(
      "Nao foi possivel enviar o aviso interno. Tente novamente em alguns instantes.",
      500,
      result.error,
    );
  }

  const { count: activeUserCount } = await admin
    .from("user_profiles")
    .select("id", { count: "exact", head: true })
    .eq("active", true)
    .in("role", OPERATIONAL_ROLES);

  return NextResponse.json({
    notification_id: result.id,
    active_user_count: activeUserCount ?? 0,
    windows_notifier_targeted: true,
    message: "Aviso interno enviado para os usuarios do painel e notificadores Windows.",
  });
}
