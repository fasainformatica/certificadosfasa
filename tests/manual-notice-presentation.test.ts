import { describe, expect, it } from "vitest";

import {
  getManualNoticeFailureMessage,
  getManualNoticeProviderLabel,
  getManualNoticeSuccessMessage,
} from "@/lib/whatsapp/manual-notice-presentation";
import { EUATENDO_PROVIDER, WHATSAPP_EXTENSION_PROVIDER } from "@/lib/whatsapp/providers";

describe("manual notice presentation", () => {
  it("diferencia envio direto pelo euAtendo de aviso enfileirado pela extensao", () => {
    expect(getManualNoticeSuccessMessage({ provider: EUATENDO_PROVIDER, mode: "sent" })).toBe(
      "Aviso enviado com sucesso pelo euAtendo.",
    );
    expect(getManualNoticeSuccessMessage({ provider: WHATSAPP_EXTENSION_PROVIDER, mode: "queued" })).toContain(
      "fila da extensão do Chrome",
    );
  });

  it("mantem erro de configuracao sem expor nomes de variaveis ou segredos", () => {
    const message = getManualNoticeFailureMessage({ provider: WHATSAPP_EXTENSION_PROVIDER, stage: "config" });

    expect(message).toBe("Não foi possível enviar o aviso. O canal extensão do Chrome não está configurado para envio.");
    expect(message).not.toContain("TOKEN");
    expect(message).not.toContain("WHATSAPP_EXTENSION");
  });

  it("usa rotulo humano para provider ativo", () => {
    expect(getManualNoticeProviderLabel(EUATENDO_PROVIDER)).toBe("euAtendo");
    expect(getManualNoticeProviderLabel(WHATSAPP_EXTENSION_PROVIDER)).toBe("extensão do Chrome");
  });
});
