import { describe, expect, it } from "vitest";

import {
  buildWhatsAppOperationalSafetySnapshot,
  normalizeWhatsAppSafetySettings,
} from "@/lib/whatsapp/operational-safety";
import { WHATSAPP_EXTENSION_PROVIDER } from "@/lib/whatsapp/providers";

describe("seguranca operacional do WhatsApp", () => {
  it("normaliza limites conservadores quando nao ha configuracao", () => {
    const settings = normalizeWhatsAppSafetySettings(null);

    expect(settings.dailyLimit).toBe(25);
    expect(settings.hourlyLimit).toBe(10);
    expect(settings.autoPauseEnabled).toBe(true);
    expect(settings.failurePauseThreshold).toBe(3);
  });

  it("bloqueia quando o limite diario foi atingido", () => {
    const snapshot = buildWhatsAppOperationalSafetySnapshot({
      provider: WHATSAPP_EXTENSION_PROVIDER,
      settings: {
        enabled: true,
        whatsapp_daily_limit: 2,
        whatsapp_hourly_limit: 2,
      },
      counts: {
        sentToday: 2,
        sentLastHour: 1,
        failuresInWindow: 0,
      },
    });

    expect(snapshot.allowed).toBe(false);
    expect(snapshot.blockedReason).toBe("daily_limit_reached");
  });

  it("recomenda pausa automatica apos falhas recentes", () => {
    const snapshot = buildWhatsAppOperationalSafetySnapshot({
      provider: WHATSAPP_EXTENSION_PROVIDER,
      settings: {
        enabled: true,
        whatsapp_auto_pause_enabled: true,
        whatsapp_failure_pause_threshold: 3,
      },
      counts: {
        sentToday: 0,
        sentLastHour: 0,
        failuresInWindow: 3,
      },
    });

    expect(snapshot.allowed).toBe(false);
    expect(snapshot.blockedReason).toBe("failure_auto_pause");
    expect(snapshot.autoPauseRecommended).toBe(true);
  });
});
