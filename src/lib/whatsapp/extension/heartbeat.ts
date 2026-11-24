import "server-only";

import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { WHATSAPP_EXTENSION_PROVIDER } from "@/lib/whatsapp/providers";
import type { WhatsAppExtensionAuthContext } from "./config";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
const WRITE_INTERVAL_MS = 60_000;
export const EXTENSION_CONTACT_WINDOW_MS = 10 * 60_000;

/**
 * Records that the authenticated extension, with a WhatsApp number, reached the server.
 * Only updated_at changes: lock, cadence and last dispatch stay untouched. A failure never blocks delivery.
 */
export async function recordExtensionContact(admin: AdminClient, auth: WhatsAppExtensionAuthContext, now = new Date()) {
  if (!auth.connectedNumber.replace(/\D/g, "")) return;
  try {
    await admin.from("whatsapp_dispatcher_state").update({ updated_at: now.toISOString() })
      .eq("provider", WHATSAPP_EXTENSION_PROVIDER)
      .lt("updated_at", new Date(now.getTime() - WRITE_INTERVAL_MS).toISOString());
  } catch {
    // Best effort.
  }
}

export function hasRecentExtensionContact(updatedAt: string | null | undefined, now = new Date()) {
  const age = updatedAt ? now.getTime() - Date.parse(updatedAt) : Number.NaN;
  return Number.isFinite(age) && age <= EXTENSION_CONTACT_WINDOW_MS;
}
