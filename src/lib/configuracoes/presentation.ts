import { formatDaysLabel } from "@/lib/utils/format";

export type ConfiguracoesSummaryTone = "blue" | "green" | "amber" | "red" | "slate";

export type ConfiguracoesSettingsPresentation = {
  enabled: boolean;
  expired_notifications_enabled: boolean;
  dias_aviso_vencimento: number[];
  delay_minimo_segundos: number;
  delay_maximo_segundos: number;
  max_attempts: number;
  polling_interval_seconds: number;
  send_window_start: string;
  send_window_end: string;
  timezone: string;
  whatsapp_daily_limit: number;
  whatsapp_hourly_limit: number;
  whatsapp_auto_pause_enabled: boolean;
};

export type ConfiguracoesTemplatePresentation = {
  key: string;
  content: string | null | undefined;
  required?: boolean;
};

export type ConfiguracoesSummaryItem = {
  key: "automation" | "days" | "window" | "cadence" | "limits" | "templates";
  label: string;
  value: string;
  description: string;
  tone: ConfiguracoesSummaryTone;
};

function normalizeDays(days: number[]) {
  return Array.from(new Set(days.filter((day) => Number.isInteger(day) && day >= 1 && day <= 365))).sort((left, right) => right - left);
}

function joinList(items: string[]) {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} e ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function formatSeconds(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "-";
  }

  if (value % 60 === 0) {
    return `${value / 60} min`;
  }

  return `${value} s`;
}

export function formatNoticeDaysSummary(days: number[]) {
  const normalized = normalizeDays(days);

  if (normalized.length === 0) {
    return "Nenhum dia configurado";
  }

  return joinList(normalized.map(formatDaysLabel));
}

export function formatDispatchWindow(settings: Pick<ConfiguracoesSettingsPresentation, "send_window_start" | "send_window_end" | "timezone">) {
  const start = settings.send_window_start || "--:--";
  const end = settings.send_window_end || "--:--";

  return {
    value: `${start} às ${end}`,
    description: settings.timezone ? `Fuso horário: ${settings.timezone}` : "Fuso horário não informado.",
  };
}

export function formatCadenceSummary(settings: Pick<ConfiguracoesSettingsPresentation, "delay_minimo_segundos" | "delay_maximo_segundos" | "max_attempts" | "polling_interval_seconds">) {
  const min = settings.delay_minimo_segundos;
  const max = settings.delay_maximo_segundos;
  const value = min === max ? formatSeconds(min) : `${formatSeconds(min)} a ${formatSeconds(max)}`;
  const validRange = Number.isFinite(min) && Number.isFinite(max) && min >= 180 && max >= min;

  return {
    value,
    tone: validRange ? "green" : "red",
    description: `Cron sugerido: ${settings.polling_interval_seconds}s. Máximo de ${settings.max_attempts} tentativas por aviso.`,
  } satisfies Pick<ConfiguracoesSummaryItem, "value" | "tone" | "description">;
}

function summarizeTemplates(templates: ConfiguracoesTemplatePresentation[]) {
  const requiredTemplates = templates.filter((template) => template.required !== false);
  const missingRequired = requiredTemplates.filter((template) => !template.content?.trim()).length;

  if (requiredTemplates.length === 0) {
    return {
      value: "Nenhum template ativo",
      tone: "amber",
      description: "Cadastre os textos antes de ativar novos canais de aviso.",
    } satisfies Pick<ConfiguracoesSummaryItem, "value" | "tone" | "description">;
  }

  if (missingRequired > 0) {
    return {
      value: `${missingRequired} pendente${missingRequired === 1 ? "" : "s"}`,
      tone: "amber",
      description: "Complete os templates essenciais antes de salvar a operação.",
    } satisfies Pick<ConfiguracoesSummaryItem, "value" | "tone" | "description">;
  }

  return {
    value: `${requiredTemplates.length}/${requiredTemplates.length} prontos`,
    tone: "green",
    description: "Templates essenciais preenchidos com as variáveis permitidas.",
  } satisfies Pick<ConfiguracoesSummaryItem, "value" | "tone" | "description">;
}

export function buildConfiguracoesOperationalSummary({
  settings,
  templates,
}: {
  settings: ConfiguracoesSettingsPresentation;
  templates: ConfiguracoesTemplatePresentation[];
}): ConfiguracoesSummaryItem[] {
  const days = normalizeDays(settings.dias_aviso_vencimento);
  const dispatchWindow = formatDispatchWindow(settings);
  const cadence = formatCadenceSummary(settings);
  const templateSummary = summarizeTemplates(templates);

  return [
    {
      key: "automation",
      label: "Envio automático",
      value: settings.enabled ? "Ativo" : "Pausado",
      tone: settings.enabled ? "green" : "amber",
      description: settings.enabled
        ? "A fila pode enviar mensagens dentro da janela configurada."
        : "A fila permanece parada até o envio automático ser ativado.",
    },
    {
      key: "days",
      label: "Dias de aviso",
      value: formatNoticeDaysSummary(days),
      tone: days.length > 0 ? "blue" : "red",
      description: settings.expired_notifications_enabled
        ? "Inclui resumos internos de certificados vencidos."
        : "Não cria novos resumos de certificados vencidos.",
    },
    {
      key: "window",
      label: "Janela de envio",
      value: dispatchWindow.value,
      tone: settings.send_window_start && settings.send_window_end ? "blue" : "amber",
      description: dispatchWindow.description,
    },
    {
      key: "cadence",
      label: "Cadência",
      value: cadence.value,
      tone: cadence.tone,
      description: cadence.description,
    },
    {
      key: "limits",
      label: "Limites WhatsApp",
      value: `${settings.whatsapp_hourly_limit}/hora · ${settings.whatsapp_daily_limit}/dia`,
      tone: settings.whatsapp_auto_pause_enabled ? "green" : "amber",
      description: settings.whatsapp_auto_pause_enabled
        ? "Pausa automática ativa após falhas recentes."
        : "Pausa automática por falhas está desativada.",
    },
    {
      key: "templates",
      label: "Mensagens",
      value: templateSummary.value,
      tone: templateSummary.tone,
      description: templateSummary.description,
    },
  ];
}
