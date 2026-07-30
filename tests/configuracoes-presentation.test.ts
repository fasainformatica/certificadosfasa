import { describe, expect, it } from "vitest";

import {
  buildConfiguracoesOperationalSummary,
  formatCadenceSummary,
  formatNoticeDaysSummary,
} from "@/lib/configuracoes/presentation";

const baseSettings = {
  enabled: true,
  expired_notifications_enabled: true,
  dias_aviso_vencimento: [30, 15, 1],
  delay_minimo_segundos: 180,
  delay_maximo_segundos: 300,
  max_attempts: 3,
  polling_interval_seconds: 5,
  send_window_start: "10:20",
  send_window_end: "18:00",
  timezone: "America/Sao_Paulo",
  whatsapp_daily_limit: 25,
  whatsapp_hourly_limit: 10,
  whatsapp_auto_pause_enabled: true,
};

describe("apresentacao de configuracoes", () => {
  it("resume dias de aviso sem duplicar valores", () => {
    expect(formatNoticeDaysSummary([1, 30, 15, 30])).toBe("30 dias, 15 dias e 1 dia");
  });

  it("explica quando o envio automatico esta pausado", () => {
    const summary = buildConfiguracoesOperationalSummary({
      settings: { ...baseSettings, enabled: false },
      templates: [
        { key: "certificate_expiring", content: "Mensagem com conteudo suficiente para o aviso." },
        { key: "certificate_expired", content: "Mensagem com conteudo suficiente para vencidos." },
      ],
    });
    const automation = summary.find((item) => item.key === "automation");

    expect(automation).toMatchObject({
      value: "Pausado",
      tone: "amber",
    });
    expect(automation?.description).toContain("fila permanece parada");
  });

  it("marca cadencia invalida quando o intervalo minimo fica abaixo do seguro", () => {
    const cadence = formatCadenceSummary({
      delay_minimo_segundos: 60,
      delay_maximo_segundos: 300,
      max_attempts: 3,
      polling_interval_seconds: 5,
    });

    expect(cadence.tone).toBe("red");
  });

  it("sinaliza templates essenciais pendentes", () => {
    const summary = buildConfiguracoesOperationalSummary({
      settings: baseSettings,
      templates: [
        { key: "certificate_expiring", content: "" },
        { key: "certificate_expired", content: "Mensagem com conteudo suficiente para vencidos." },
        { key: "client_certificate_expiring", content: "Mensagem com conteudo suficiente para clientes." },
        { key: "client_certificate_expired", content: "", required: false },
      ],
    });
    const templates = summary.find((item) => item.key === "templates");

    expect(templates).toMatchObject({
      value: "1 pendente",
      tone: "amber",
    });
  });
});
