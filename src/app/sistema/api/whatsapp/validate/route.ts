import { NextRequest } from "next/server";

import {
  authenticateWhatsAppExtension,
  extensionError,
  extensionJson,
  extensionOptions,
  getWhatsAppExtensionConfigStatus,
} from "@/lib/whatsapp/extension/config";
import { WHATSAPP_EXTENSION_PROVIDER } from "@/lib/whatsapp/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: NextRequest) {
  return extensionOptions(request);
}

export async function GET(request: NextRequest) {
  const auth = authenticateWhatsAppExtension(request);

  if (!auth.ok) {
    return extensionError(request, auth);
  }

  const config = getWhatsAppExtensionConfigStatus();

  return extensionJson(request, {
    ok: true,
    provider: WHATSAPP_EXTENSION_PROVIDER,
    active_provider: config.activeProvider,
    connected_number: auth.context.connectedNumber ? "[telefone]" : null,
    extension_version: auth.context.extensionVersion,
  });
}

export const POST = GET;
