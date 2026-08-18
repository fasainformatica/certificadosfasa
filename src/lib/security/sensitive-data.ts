type ErrorLike = {
  code?: unknown;
  message?: unknown;
};

const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
  [/\bBasic\s+[A-Za-z0-9+/=-]+/gi, "Basic [redacted]"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[jwt]"],
  [/\b(sb_secret|service_role|cert_encryption_key|cron_secret|euatendo_api_token|windows_notifier_token)\b/gi, "[secret]"],
  [/\b(authorization|apikey|api_key|token|password|senha)\s*[:=]\s*["']?[^"',\s}]+/gi, "$1=[redacted]"],
  [/certificados\/[0-9]{14}\/[^\s"'`<>]+\.pfx/gi, "[storage_path]"],
  [/\b(?:55)?[1-9]{2}9?\d{8}\b/g, "[phone]"],
];

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && typeof (error as ErrorLike).code === "string"
    ? String((error as ErrorLike).code)
    : null;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && typeof (error as ErrorLike).message === "string") {
    return String((error as ErrorLike).message);
  }

  return typeof error === "string" ? error : "";
}

export function redactSensitiveText(value: unknown, maxLength = 500) {
  const raw = errorMessage(value) || String(value ?? "");
  const withoutStack = raw.split(/\r?\n/)[0] ?? "";

  return REDACTION_PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), withoutStack)
    .slice(0, maxLength)
    .trim();
}

export function getSafeOperationalErrorMessage(
  error: unknown,
  fallback = "Nao foi possivel concluir esta operacao. Tente novamente em alguns instantes.",
) {
  const code = errorCode(error);
  const raw = `${code ?? ""} ${redactSensitiveText(error)}`.toLowerCase();

  if (code === "AUTHENTICATION_ERROR" || /unauthorized|forbidden|\b401\b|\b403\b|\[secret\]|\[jwt\]/i.test(raw)) {
    return "Nao foi possivel autenticar a integracao. Revise as credenciais server-side.";
  }

  if (code === "INSTANCE_NOT_FOUND") {
    return "A instancia configurada nao foi encontrada na integracao.";
  }

  if (code === "INSTANCE_DISCONNECTED") {
    return "A instancia do WhatsApp esta desconectada.";
  }

  if (code === "INVALID_NUMBER" || /invalid_number|numero|número|telefone|phone|whatsapp/i.test(raw)) {
    return "O telefone do destinatario precisa ser revisado antes de um novo envio.";
  }

  if (code === "RATE_LIMITED" || /rate|too many|\b429\b|limite/i.test(raw)) {
    return "O canal recusou o volume atual. Aguarde a proxima tentativa automatica.";
  }

  if (code === "PROVIDER_TIMEOUT" || /timeout|econnreset|network|fetch failed|aborted/i.test(raw)) {
    return "A integracao demorou para responder. Tente novamente em alguns instantes.";
  }

  if (code === "PROVIDER_UNAVAILABLE" || /unavailable|connect|conectar|offline/i.test(raw)) {
    return "Nao foi possivel conectar na integracao do WhatsApp.";
  }

  if (/for update|outer join|reserve|reservation|rpc|postgrest|pgrst|sql|relation|column|violates/i.test(raw)) {
    return "Nao foi possivel reservar a proxima mensagem. Uma nova tentativa podera ser feita automaticamente.";
  }

  if (/\[storage_path\]|signed url|storage/i.test(raw)) {
    return "Nao foi possivel acessar o arquivo protegido. Tente novamente ou gere um novo link.";
  }

  return fallback;
}
