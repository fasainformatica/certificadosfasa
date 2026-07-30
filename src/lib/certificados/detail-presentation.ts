import type { Tone } from "@/components/ui/status-badge";
import { daysUntilDate } from "@/lib/certificados/status";
import { formatRelativeExpiration } from "@/lib/utils/format";

export function formatCertificateFingerprint(hash: string | null | undefined) {
  if (!hash) {
    return "-";
  }

  if (hash.length <= 24) {
    return hash;
  }

  return `${hash.slice(0, 12)}...${hash.slice(-10)}`;
}

export function getCertificateExpirationPresentation(dataVencimento: string, timeZone = "America/Sao_Paulo") {
  const days = daysUntilDate(dataVencimento, timeZone);
  const label = formatRelativeExpiration(days);

  if (days < 0) {
    return {
      days,
      label,
      tone: "red" as Tone,
      action: "Renovar certificado",
      description: "O certificado está vencido e deve ser tratado antes de novos usos.",
    };
  }

  if (days === 0) {
    return {
      days,
      label,
      tone: "amber" as Tone,
      action: "Acompanhar renovação hoje",
      description: "O certificado vence hoje. Priorize a confirmação da renovação.",
    };
  }

  if (days <= 30) {
    return {
      days,
      label,
      tone: "amber" as Tone,
      action: "Acompanhar renovação",
      description: "O certificado está dentro da janela de atenção configurada.",
    };
  }

  return {
    days,
    label,
    tone: "green" as Tone,
    action: "Manter acompanhamento",
    description: "O certificado ainda está fora da janela de vencimento próximo.",
  };
}

export function getWhatsAppNoticePresentation(enabled: boolean | null | undefined) {
  return enabled === false
    ? {
        label: "Avisos pausados para o cliente",
        tone: "amber" as Tone,
        description: "A equipe continua recebendo avisos internos quando configurado.",
      }
    : {
        label: "Avisos permitidos",
        tone: "green" as Tone,
        description: "O cliente pode receber avisos por WhatsApp se houver telefone válido.",
      };
}
