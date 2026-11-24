import { formatCnpj as legacyFormatCnpj } from "@/lib/utils/format";

export const DISPLAY_TIME_ZONE = "America/Sao_Paulo";
export type DateInput = string | Date | null | undefined;
const missing = "Não informado";
const invalid = "Indisponível";
const calendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: DISPLAY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const clock = new Intl.DateTimeFormat("pt-BR", {
  timeZone: DISPLAY_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function parseDate(value: DateInput): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(value);
  if (!iso) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00", fraction = "0", zone] = iso;
  const utc = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second, +fraction.slice(0, 3).padEnd(3, "0"));
  const check = new Date(utc);
  if (check.getUTCFullYear() !== +year || check.getUTCMonth() !== +month - 1 || check.getUTCDate() !== +day || +hour > 23 || +minute > 59 || +second > 59) return null;
  if (zone) {
    const result = new Date(value);
    return Number.isFinite(result.getTime()) ? result : null;
  }
  // Date-only and timezone-less inputs are wall-clock dates in Sao Paulo, not the host timezone.
  const offsetClock = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE, timeZoneName: "longOffset",
  });
  let result = check;
  for (let i = 0; i < 2; i++) {
    const offset = offsetClock.formatToParts(result).find((part) => part.type === "timeZoneName")?.value;
    const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offset ?? "");
    const minutes = match ? (match[1] === "+" ? 1 : -1) * (+match[2] * 60 + +match[3]) : 0;
    result = new Date(utc - minutes * 60_000);
  }
  return result;
}

function dateParts(date: Date) {
  const parts = calendar.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)!.value;
  return { year: part("year"), month: part("month"), day: part("day") };
}

export function formatDate(value: DateInput): string {
  if (value == null || value === "") return missing;
  const date = parseDate(value);
  if (!date) return invalid;
  const { year, month, day } = dateParts(date);
  return `${day}/${month}/${year}`;
}

export function formatDateTime(value: DateInput): string {
  if (value == null || value === "") return missing;
  const date = parseDate(value);
  return date ? `${formatDate(date)} às ${clock.format(date)}` : invalid;
}

export function formatRelative(value: DateInput, reference: DateInput = new Date()): string {
  if (value == null || value === "") return missing;
  const date = parseDate(value);
  const now = parseDate(reference);
  if (!date || !now) return invalid;
  const ordinal = (input: Date) => {
    const { year, month, day } = dateParts(input);
    return Date.UTC(+year, +month - 1, +day) / 86_400_000;
  };
  const days = ordinal(date) - ordinal(now);
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days === -1) return "ontem";
  return days < 0 ? `há ${formatCount(-days)} dias` : `em ${formatCount(days)} dias`;
}

export function formatCnpj(value: string | null | undefined): string {
  if (!value?.trim()) return missing;
  return value.replace(/\D/g, "").length === 14 ? legacyFormatCnpj(value) : invalid;
}

function phoneParts(value: string) {
  const digits = value.replace(/\D/g, "");
  // A local DDD of 55 is not a country prefix unless the total length includes it.
  const local = (digits.length === 12 || digits.length === 13) && digits.startsWith("55") ? digits.slice(2) : digits;
  return /^\d{10,11}$/.test(local) ? { area: local.slice(0, 2), number: local.slice(2) } : null;
}

export function formatPhone(value: string | null | undefined): string {
  if (!value?.trim()) return missing;
  const parts = phoneParts(value);
  if (!parts) return invalid;
  return `+55 (${parts.area}) ${parts.number.slice(0, -4)}-${parts.number.slice(-4)}`;
}

export function formatMaskedPhone(value: string | null | undefined): string {
  if (!value?.trim()) return missing;
  const parts = phoneParts(value);
  if (!parts) return invalid;
  return `+55 (${parts.area}) ${"•".repeat(parts.number.length - 4)}-••${parts.number.slice(-2)}`;
}

export function formatCount(value: number | null | undefined): string {
  if (value == null) return "Sem medições";
  return Number.isFinite(value) ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value) : invalid;
}

export function formatDays(days: number | null | undefined): string {
  if (days == null) return missing;
  if (!Number.isInteger(days)) return invalid;
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  if (days < 0) return `Venceu há ${formatCount(-days)} ${days === -1 ? "dia" : "dias"}`;
  return `Vence em ${formatCount(days)} dias`;
}
