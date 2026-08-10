import { describe, expect, it } from "vitest";

import {
  buildBroadcastInternalNotificationPayload,
  buildCertificateUploadInternalNotificationPayload,
  createInternalNotification,
} from "@/lib/internal-notifications/service";

function basePayloadInput() {
  return {
    operation: "updated" as const,
    certificadoId: "11111111-1111-4111-8111-111111111111",
    clienteId: "22222222-2222-4222-8222-222222222222",
    actorUserId: "33333333-3333-4333-8333-333333333333",
    cnpj: "11222333000144",
    nomeTitular: "Cliente Teste LTDA",
    dataVencimento: "2026-08-15",
    hashArquivo: "a".repeat(64),
    source: "upload_individual" as const,
  };
}

describe("internal notification service", () => {
  it("gera payload seguro para certificado atualizado", () => {
    const payload = buildCertificateUploadInternalNotificationPayload(basePayloadInput());

    expect(payload).toMatchObject({
      type: "certificate_updated",
      severity: "info",
      title: "Certificado atualizado",
      href: "/certificados/11111111-1111-4111-8111-111111111111",
      entity_type: "certificado",
      entity_id: "11111111-1111-4111-8111-111111111111",
      certificado_id: "11111111-1111-4111-8111-111111111111",
      cliente_id: "22222222-2222-4222-8222-222222222222",
      actor_user_id: "33333333-3333-4333-8333-333333333333",
    });
    expect(payload.body).toContain("15/08/2026");
    expect(payload.dedupe_key).toBe(
      "certificate_upload:updated:11111111-1111-4111-8111-111111111111:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(JSON.stringify(payload)).not.toContain("senha");
    expect(JSON.stringify(payload)).not.toContain("storage_path");
    expect(JSON.stringify(payload)).not.toContain("service_role");
  });

  it("gera payload distinto para novo certificado", () => {
    const payload = buildCertificateUploadInternalNotificationPayload({
      ...basePayloadInput(),
      operation: "created",
      source: "importacao_em_massa",
    });

    expect(payload).toMatchObject({
      type: "certificate_created",
      severity: "success",
      title: "Novo certificado cadastrado",
    });
    expect(payload.metadata).toMatchObject({
      source: "importacao_em_massa",
      operation: "created",
      cnpj: "11222333000144",
    });
  });

  it("gera aviso interno geral para painel e notificadores Windows", () => {
    const payload = buildBroadcastInternalNotificationPayload({
      title: "Aviso geral",
      body: "Mensagem para todos os usuarios.",
      severity: "warning",
      actorUserId: "33333333-3333-4333-8333-333333333333",
      expiresAt: "2026-08-17T10:00:00.000Z",
    });

    expect(payload).toMatchObject({
      type: "system_notice",
      severity: "warning",
      title: "Aviso geral",
      body: "Mensagem para todos os usuarios.",
      href: "/notificacoes-internas",
      entity_type: "sistema",
      target_role: null,
      target_user_id: null,
      actor_user_id: "33333333-3333-4333-8333-333333333333",
      expires_at: "2026-08-17T10:00:00.000Z",
    });
    expect(payload.metadata).toMatchObject({
      source: "manual_internal_broadcast",
      audience: "all_internal_users_and_windows_notifiers",
    });
    expect(JSON.stringify(payload)).not.toContain("senha");
    expect(JSON.stringify(payload)).not.toContain("storage_path");
    expect(JSON.stringify(payload)).not.toContain("service_role");
  });

  it("nao propaga falha de insert para o fluxo principal", async () => {
    const admin = {
      from: () => ({
        insert: () => {
          throw new Error("schema not ready");
        },
      }),
    } as never;

    await expect(createInternalNotification(admin, buildCertificateUploadInternalNotificationPayload(basePayloadInput()))).resolves.toEqual({
      created: false,
      error: "internal_notification_insert_failed",
    });
  });
});
