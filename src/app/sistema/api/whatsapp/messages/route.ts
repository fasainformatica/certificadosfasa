import { NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  authenticateWhatsAppExtension,
  extensionError,
  extensionJson,
  extensionOptions,
} from "@/lib/whatsapp/extension/config";
import {
  processWhatsAppExtensionAcks,
  reserveNextWhatsAppExtensionMessage,
} from "@/lib/whatsapp/extension/dispatcher";

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
    await processWhatsAppExtensionAcks({ admin, auth: auth.context, body });
    const result = await reserveNextWhatsAppExtensionMessage({ admin, auth: auth.context, body });

    return extensionJson(request, result.messages);
  } catch {
    return extensionJson(
      request,
      {
        error: "Nao foi possivel buscar mensagens para a extensao do WhatsApp.",
        code: 500,
      },
      500,
    );
  }
}

export async function GET(request: NextRequest) {
  const auth = authenticateWhatsAppExtension(request);

  if (!auth.ok) {
    return extensionError(request, auth);
  }

  return extensionJson(request, []);
}
