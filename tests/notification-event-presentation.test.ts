import { describe, expect, it } from "vitest";

import {
  getNotificationNoticeText,
  getNotificationRecommendedAction,
  getSafeNotificationErrorMessage,
  isRetryableNotificationStatus,
} from "@/lib/notifications/event-presentation";

describe("apresentacao operacional de avisos", () => {
  it("descreve avisos de vencimento em linguagem humana", () => {
    expect(getNotificationNoticeText({ type: "certificate_expiring", dias_restantes: 1, certificados: null })).toBe(
      "Vence amanhã",
    );
    expect(getNotificationNoticeText({ type: "certificate_expired", dias_restantes: null, certificados: null })).toBe(
      "Resumo diário de certificados vencidos",
    );
  });

  it("mostra a proxima acao conforme status do evento", () => {
    expect(
      getNotificationRecommendedAction(
        {
          status: "pending",
          type: "certificate_expiring",
          dias_restantes: 15,
          send_date: "2026-07-29",
        },
        { today: "2026-07-29" },
      ),
    ).toBe("Aguardando o próximo disparo");

    expect(
      getNotificationRecommendedAction({
        status: "failed",
        type: "certificate_expiring",
        dias_restantes: 15,
        send_date: "2026-07-29",
      }),
    ).toBe("Verificar o motivo e tentar novamente");
  });

  it("sanitiza erros tecnicos antes da exibicao", () => {
    expect(getSafeNotificationErrorMessage("FOR UPDATE cannot be applied to the nullable side of an outer join")).toBe(
      "Não foi possível reservar a próxima mensagem.",
    );
    expect(getSafeNotificationErrorMessage("401 unauthorized token abc")).toBe(
      "Não foi possível autenticar a integração. Revise as configurações do WhatsApp.",
    );
    expect(getSafeNotificationErrorMessage(null)).toBeNull();
  });

  it("limita reenfileiramento aos status operacionais permitidos", () => {
    expect(isRetryableNotificationStatus("failed")).toBe(true);
    expect(isRetryableNotificationStatus("cancelled")).toBe(true);
    expect(isRetryableNotificationStatus("sent")).toBe(false);
    expect(isRetryableNotificationStatus("processing")).toBe(false);
  });
});
