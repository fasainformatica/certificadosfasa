export function formatCnpj(cnpj: string) {
  const digits = cnpj.replace(/\D/g, "");

  if (digits.length !== 14) {
    return cnpj;
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function formatDate(date: string | null) {
  if (!date) {
    return "-";
  }

  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR");
}

export function formatDateTime(date: string | null) {
  if (!date) {
    return "-";
  }

  return new Date(date).toLocaleString("pt-BR");
}

export function formatPhone(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;

  if (local.length === 11) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }

  if (local.length === 10) {
    return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }

  return value;
}

export function formatDaysLabel(days: number) {
  return `${days} ${Math.abs(days) === 1 ? "dia" : "dias"}`;
}

export function formatCertificateTitle(title: string, cnpj?: string | null) {
  const trimmed = title.trim();
  const cnpjDigits = cnpj?.replace(/\D/g, "");

  if (cnpjDigits) {
    const escapedDigits = cnpjDigits.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const formattedCnpj = formatCnpj(cnpjDigits).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const suffixPattern = new RegExp(`\\s*[:\\-–—]?\\s*(?:${escapedDigits}|${formattedCnpj})\\s*$`);
    return trimmed.replace(suffixPattern, "").trim() || trimmed;
  }

  return trimmed.replace(/\s*[:\-–—]\s*\d{14}\s*$/, "").trim() || trimmed;
}
