import { describe, expect, it } from "vitest";

import {
  getInternalBrowserNotificationDecision,
  INTERNAL_BROWSER_NOTIFICATION_FALLBACK_HREF,
} from "@/lib/internal-notifications/browser-notifications";
import type { InternalNotificationDto } from "@/lib/internal-notifications/presentation";

function notification(overrides: Partial<InternalNotificationDto> = {}): InternalNotificationDto {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    type: "certificate_updated",
    severity: "info",
    title: "Certificado atualizado",
    body: "Um certificado foi atualizado.",
    href: "/certificados/11111111-1111-4111-8111-111111111111",
    entityType: "certificado",
    entityId: "11111111-1111-4111-8111-111111111111",
    certificadoId: "11111111-1111-4111-8111-111111111111",
    clienteId: null,
    targetRole: null,
    targetUserId: null,
    actorUserId: null,
    metadata: {},
    createdAt: "2026-08-10T10:00:00.000Z",
    expiresAt: null,
    readAt: null,
    dismissedAt: null,
    isRead: false,
    isDismissed: false,
    ...overrides,
  };
}

describe("internal browser notifications", () => {
  it("usa a primeira notificacao apenas como linha de base para nao avisar historico antigo", () => {
    expect(
      getInternalBrowserNotificationDecision({
        latestNotification: notification(),
        lastSeenId: null,
        enabled: true,
        permission: "granted",
        pageVisible: false,
      }),
    ).toEqual({
      action: "ignore",
      nextLastSeenId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("mostra popup apenas para nova notificacao quando esta habilitado, permitido e fora do foco", () => {
    expect(
      getInternalBrowserNotificationDecision({
        latestNotification: notification({
          id: "22222222-2222-4222-8222-222222222222",
          body: "Novo PFX recebido.",
        }),
        lastSeenId: "11111111-1111-4111-8111-111111111111",
        enabled: true,
        permission: "granted",
        pageVisible: false,
      }),
    ).toEqual({
      action: "show",
      nextLastSeenId: "22222222-2222-4222-8222-222222222222",
      title: "Certificado atualizado",
      body: "Novo PFX recebido.",
      href: "/certificados/11111111-1111-4111-8111-111111111111",
      tag: "fasa-internal-notification-22222222-2222-4222-8222-222222222222",
    });
  });

  it("nao mostra popup quando a pagina esta visivel, mas atualiza o ultimo item visto", () => {
    expect(
      getInternalBrowserNotificationDecision({
        latestNotification: notification({ id: "33333333-3333-4333-8333-333333333333" }),
        lastSeenId: "11111111-1111-4111-8111-111111111111",
        enabled: true,
        permission: "granted",
        pageVisible: true,
      }),
    ).toEqual({
      action: "ignore",
      nextLastSeenId: "33333333-3333-4333-8333-333333333333",
    });
  });

  it("usa a central interna como destino quando a notificacao nao tem href", () => {
    const decision = getInternalBrowserNotificationDecision({
      latestNotification: notification({
        id: "44444444-4444-4444-8444-444444444444",
        body: null,
        href: null,
      }),
      lastSeenId: "11111111-1111-4111-8111-111111111111",
      enabled: true,
      permission: "granted",
      pageVisible: false,
    });

    expect(decision).toMatchObject({
      action: "show",
      body: "Abra a central interna para revisar.",
      href: INTERNAL_BROWSER_NOTIFICATION_FALLBACK_HREF,
    });
  });

  it("nao mostra popup sem permissao ou com recurso desativado", () => {
    expect(
      getInternalBrowserNotificationDecision({
        latestNotification: notification({ id: "55555555-5555-4555-8555-555555555555" }),
        lastSeenId: "11111111-1111-4111-8111-111111111111",
        enabled: false,
        permission: "granted",
        pageVisible: false,
      }).action,
    ).toBe("ignore");
    expect(
      getInternalBrowserNotificationDecision({
        latestNotification: notification({ id: "66666666-6666-4666-8666-666666666666" }),
        lastSeenId: "11111111-1111-4111-8111-111111111111",
        enabled: true,
        permission: "denied",
        pageVisible: false,
      }).action,
    ).toBe("ignore");
  });
});
