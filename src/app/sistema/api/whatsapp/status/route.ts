import { NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  authenticateWhatsAppExtension,
  extensionError,
  extensionJson,
  extensionOptions,
} from "@/lib/whatsapp/extension/config";
import { processWhatsAppExtensionAcks } from "@/lib/whatsapp/extension/dispatcher";
import { WHATSAPP_EXTENSION_PROVIDER } from "@/lib/whatsapp/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readJsonBody(request: NextRequest) {
  return request.json().catch(() => ({}));
}

export function OPTIONS(request: NextRequest) {
  return extensionOptions(request);
}

export async function POST(request: NextRequest) {
  const auth = authenticateWhatsAppExtension(request);

  if (!auth.ok) {
    return extensionError(request, auth);
  }

  const body = await readJsonBody(request);
  const admin = createSupabaseAdminClient();

  try {
    const acks = await processWhatsAppExtensionAcks({ admin, auth: auth.context, body });

    return extensionJson(request, {
      ok: true,
      provider: WHATSAPP_EXTENSION_PROVIDER,
      acks,
    });
  } catch {
    return extensionJson(
      request,
      {
        error: "Nao foi possivel atualizar o status da extensao do WhatsApp.",
        code: 500,
      },
      500,
    );
  }
}
