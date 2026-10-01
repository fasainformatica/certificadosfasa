import { createClient } from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecipientPreferences } from "@/components/notifications/recipient-preferences";
import { notificationRecipientSchema, notificationRecipientUpdateSchema } from "@/lib/notifications/validation";
import { createInternalNotification, buildBroadcastInternalNotificationPayload } from "@/lib/internal-notifications/service";
import { getNotificationNoticeText, NOTIFICATION_EVENT_TYPE_LABELS } from "@/lib/notifications/event-presentation";
import type { Database } from "@/lib/supabase/database.types";

afterEach(() => vi.unstubAllEnvs());

describe("recipient preferences", () => {
  it("defaults new and legacy callers to general notices only", () => {
    expect(notificationRecipientSchema.parse({ nome: "Equipe", telefone: "11999999999" })).toMatchObject({
      ativo: true, notify_general: true, notify_certificate_updates: false,
    });
  });

  it.each([[true, true], [false, true], [true, false], [false, false]])("accepts independent preferences general=%s updates=%s", (general, updates) => {
    expect(notificationRecipientSchema.parse({
      nome: "Equipe", telefone: "11999999999", notify_general: general, notify_certificate_updates: updates,
    })).toMatchObject({ notify_general: general, notify_certificate_updates: updates });
  });

  it("does not apply creation defaults to a partial edit or silently opt back in", () => {
    expect(notificationRecipientUpdateSchema.parse({ nome: "Equipe" })).toEqual({ nome: "Equipe" });
    expect(notificationRecipientUpdateSchema.parse({ notify_general: false })).toEqual({ notify_general: false });
    expect(notificationRecipientUpdateSchema.safeParse({}).success).toBe(false);
    expect(notificationRecipientUpdateSchema.safeParse({ notify_certificate_updates: "false" }).success).toBe(false);
  });

  it("renders two labelled independent checkboxes, respecting disabled state", () => {
    const html = renderToStaticMarkup(<RecipientPreferences label="Avisos para Equipe" disabled value={{
      notify_general: false, notify_certificate_updates: true,
    }} onChange={() => undefined} />);
    expect(html).toContain("Certificados atualizados");
    expect(html).toContain("Avisos gerais");
    expect(html).toContain("Avisos para Equipe");
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toContain("disabled");
    expect(html).toContain("fieldset");
  });

  it.each(["certificate_updated", "internal_notice"] as const)("presents %s without a misleading expiry countdown", (type) => {
    const text = getNotificationNoticeText({ type, dias_restantes: 0, certificados: { data_vencimento: "2030-12-31" } });
    expect(text).not.toMatch(/vence|vencido/i);
    expect(NOTIFICATION_EVENT_TYPE_LABELS[type]).toBeTruthy();
  });

  it.each(["whatsapp_extension", "euatendo"])("uses the server-selected provider %s and preserves the internal notice payload", async (provider) => {
    vi.stubEnv("WHATSAPP_PROVIDER", provider);
    const requestBodies: unknown[] = [];
    const client = createClient<Database>("https://example.supabase.co", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (_input, init) => {
        requestBodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ id: "notice-id" }), { status: 201, headers: { "Content-Type": "application/json" } });
      } },
    });
    const payload = buildBroadcastInternalNotificationPayload({
      title: "Aviso interno", body: "Comunicado para todos.", severity: "info",
      actorUserId: "10000000-0000-4000-8000-000000000001", expiresAt: "2030-01-01T00:00:00Z",
    });
    await expect(createInternalNotification(client, {
      ...payload, metadata: { source: "manual_internal_broadcast", whatsapp_provider: "untrusted-client-value" },
    })).resolves.toEqual({ created: true, id: "notice-id" });
    expect(requestBodies).toEqual([expect.objectContaining({
      title: payload.title, body: payload.body, href: payload.href,
      metadata: { source: "manual_internal_broadcast", whatsapp_provider: provider },
    })]);
  });
});
