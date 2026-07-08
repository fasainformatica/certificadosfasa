export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidCnpj(value: string) {
  const cnpj = onlyDigits(value);

  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) {
    return false;
  }

  const digits = cnpj.split("").map(Number);
  const calc = (length: number) => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = digits.slice(0, length).reduce((acc, digit, index) => acc + digit * weights[index], 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  return calc(12) === digits[12] && calc(13) === digits[13];
}

export function extractFirstValidCnpj(text: string) {
  const candidates = new Set<string>();
  const formattedPattern = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g;
  const compactPattern = /(?:^|\D)(\d{14})(?!\d)/g;

  for (const match of text.matchAll(formattedPattern)) {
    candidates.add(onlyDigits(match[0]));
  }

  for (const match of text.matchAll(compactPattern)) {
    candidates.add(match[1]);
  }

  return [...candidates].find(isValidCnpj) ?? null;
}
