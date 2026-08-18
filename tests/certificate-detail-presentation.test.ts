import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  formatCertificateFingerprint,
  getCertificateExpirationPresentation,
  getWhatsAppNoticePresentation,
} from "@/lib/certificados/detail-presentation";

const detailPageSource = readFileSync(join(process.cwd(), "src/app/(internal)/certificados/[id]/page.tsx"), "utf8");

describe("certificate detail presentation", () => {
  it("reduz identificador tecnico longo sem apagar a referencia", () => {
    expect(formatCertificateFingerprint("abc")).toBe("abc");
    expect(formatCertificateFingerprint("a".repeat(64))).toBe("aaaaaaaaaaaa...aaaaaaaaaa");
    expect(formatCertificateFingerprint(null)).toBe("-");
  });

  it("gera resumo acionavel do vencimento", () => {
    vi.setSystemTime(new Date("2026-07-30T12:00:00-03:00"));

    expect(getCertificateExpirationPresentation("2026-07-30").label).toBe("Vence hoje");
    expect(getCertificateExpirationPresentation("2026-07-31").action).toBe("Acompanhar renovação");
    expect(getCertificateExpirationPresentation("2026-07-20").tone).toBe("red");
    expect(getCertificateExpirationPresentation("2026-09-15").tone).toBe("green");

    vi.useRealTimers();
  });

  it("descreve permissao de aviso por WhatsApp sem depender apenas de cor", () => {
    expect(getWhatsAppNoticePresentation(false)).toMatchObject({
      label: "Avisos pausados para o cliente",
      tone: "amber",
    });
    expect(getWhatsAppNoticePresentation(true)).toMatchObject({
      label: "Avisos permitidos",
      tone: "green",
    });
  });

  it("exibe download interno autenticado no detalhe do certificado", () => {
    expect(detailPageSource).toContain("Baixar certificado");
    expect(detailPageSource).toContain("/api/certificados/${id}/arquivo");
    expect(detailPageSource).toContain("canManageCertificate");
  });
});
