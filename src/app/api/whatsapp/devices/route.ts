import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { whatsappDeviceSchema } from "@/lib/notifications/validation";
import { generateDeviceCredentials } from "@/lib/qwep/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const DEVICE_SELECT =
  "id, name, status, is_primary_sender, connected_phone, browser_name, user_agent, app_version, last_seen_at, last_connected_at, last_disconnected_at, created_by, created_at, updated_at, revoked_at";

export async function GET() {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("whatsapp_devices").select(DEVICE_SELECT).order("created_at", { ascending: false });

  if (error) {
    return jsonError("Falha ao carregar dispositivos.", 500, "devices_erro");
  }

  return NextResponse.json({ devices: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = whatsappDeviceSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Dados invalidos.", 400, "validacao");
  }

  const admin = createSupabaseAdminClient();
  const credentials = generateDeviceCredentials();
  const { data: existingPrimary } = await admin
    .from("whatsapp_devices")
    .select("id")
    .eq("is_primary_sender", true)
    .neq("status", "revoked")
    .maybeSingle();

  const { data, error } = await admin
    .from("whatsapp_devices")
    .insert({
      name: parsed.data.name,
      token_hash: credentials.tokenHash,
      signing_secret_hash: credentials.signingSecretHash,
      signing_secret_ciphertext: credentials.signingSecretCiphertext,
      signing_secret_iv: credentials.signingSecretIv,
      signing_secret_auth_tag: credentials.signingSecretAuthTag,
      status: "pending_activation",
      is_primary_sender: !existingPrimary,
      created_by: auth.user.id,
    })
    .select(DEVICE_SELECT)
    .single();

  if (error || !data) {
    return jsonError("Falha ao criar dispositivo.", 500, "device_criar");
  }

  await admin.from("whatsapp_device_logs").insert({
    device_id: data.id,
    event_type: "device_created",
    message: "Dispositivo criado. Credenciais exibidas uma unica vez.",
    metadata: {},
  });

  return NextResponse.json(
    {
      device: data,
      token: credentials.token,
      signing_secret: credentials.signingSecret,
    },
    { status: 201 },
  );
}
