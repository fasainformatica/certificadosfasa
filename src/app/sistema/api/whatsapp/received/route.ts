import { NextRequest } from "next/server";

import {
  authenticateWhatsAppExtension,
  extensionError,
  extensionJson,
  extensionOptions,
} from "@/lib/whatsapp/extension/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: NextRequest) {
  return extensionOptions(request);
}

export async function POST(request: NextRequest) {
  const auth = authenticateWhatsAppExtension(request);

  if (!auth.ok) {
    return extensionError(request, auth);
  }

  return extensionJson(request, null);
}
