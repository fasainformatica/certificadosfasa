export function normalizeBrazilianPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    throw new Error("Informe um WhatsApp valido.");
  }

  const withoutCountry = digits.startsWith("55") ? digits.slice(2) : digits;

  if (!/^[1-9]{2}[0-9]{8,9}$/.test(withoutCountry)) {
    throw new Error("Informe um WhatsApp com DDD e numero.");
  }

  return `55${withoutCountry}`;
}

export function maskPhone(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const digits = value.replace(/\D/g, "");

  if (digits.length < 6) {
    return "***";
  }

  return `${digits.slice(0, 4)}*****${digits.slice(-2)}`;
}
