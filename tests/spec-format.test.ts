import { describe, expect, it } from "vitest";
import { DISPLAY_TIME_ZONE, formatCnpj, formatCount, formatDate, formatDateTime, formatDays, formatMaskedPhone, formatPhone, formatRelative } from "@/lib/format";

describe("spec section 5 formatters", () => {
  it("uses the operational timezone and preserves date-only calendar dates", () => {
    expect(DISPLAY_TIME_ZONE).toBe("America/Sao_Paulo");
    expect(formatDate("2026-12-02")).toBe("02/12/2026");
    expect(formatDate("2026-12-02T01:00:00Z")).toBe("01/12/2026");
    expect(formatDate(new Date("2026-12-02T03:00:00Z"))).toBe("02/12/2026");
  });
  it.each([
    ["2026-11-20T03:00:00Z", "20/11/2026 às 00:00"],
    ["2026-11-20T00:00:00-03:00", "20/11/2026 às 00:00"],
    ["2026-11-20T00:00", "20/11/2026 às 00:00"],
    ["2026-11-20", "20/11/2026 às 00:00"],
    ["2018-12-02T02:00:00Z", "02/12/2018 às 00:00"],
    ["2018-12-02T00:00:00", "02/12/2018 às 00:00"],
  ])("formats %s independently of the host timezone", (input, output) => {
    expect(formatDateTime(input)).toBe(output);
  });
  it.each(["invalid", "2026-02-30", "2026-13-01", "2026-01-01T25:00:00", "2026-01-01T00:60:00", "2026-01-01T00:00:60Z"])("rejects invalid dates: %s", (input) => {
    expect(formatDate(input)).toBe("Indisponível");
    expect(formatDateTime(input)).toBe("Indisponível");
  });
  it("distinguishes absent and invalid dates", () => {
    expect(formatDate(null)).toBe("Não informado");
    expect(formatDateTime(undefined)).toBe("Não informado");
    expect(formatDate(new Date(NaN))).toBe("Indisponível");
  });
  it.each([
    ["2026-11-20", "há 3 dias"], ["2026-11-22", "ontem"], ["2026-11-23", "hoje"],
    ["2026-11-24", "amanhã"], ["2026-12-02", "em 9 dias"],
  ])("formats relative calendar days for %s", (input, output) => {
    expect(formatRelative(input, "2026-11-23")).toBe(output);
  });
  it("compares calendar dates in Sao Paulo across midnight rather than elapsed 24h", () => {
    expect(formatRelative("2026-11-24T03:01:00Z", "2026-11-24T02:59:00Z")).toBe("amanhã");
    expect(formatRelative(null)).toBe("Não informado");
    expect(formatRelative("invalid")).toBe("Indisponível");
    expect(formatRelative("2026-11-23", "invalid")).toBe("Indisponível");
  });
  it("formats CNPJ while preserving legacy exports", () => {
    expect(formatCnpj("40664110000172")).toBe("40.664.110/0001-72");
    expect(formatCnpj("40.664.110/0001-72")).toBe("40.664.110/0001-72");
    expect(formatCnpj(null)).toBe("Não informado");
    expect(formatCnpj("123")).toBe("Indisponível");
  });
  it.each([
    ["15997059576", "+55 (15) 99705-9576", "+55 (15) •••••-••76"],
    ["5515997059576", "+55 (15) 99705-9576", "+55 (15) •••••-••76"],
    ["+55 (15) 99705-9576", "+55 (15) 99705-9576", "+55 (15) •••••-••76"],
    ["1532345678", "+55 (15) 3234-5678", "+55 (15) ••••-••78"],
    ["55912345678", "+55 (55) 91234-5678", "+55 (55) •••••-••78"],
  ])("formats and safely masks %s", (input, full, masked) => {
    expect(formatPhone(input)).toBe(full);
    expect(formatMaskedPhone(input)).toBe(masked);
  });
  it("does not expose malformed phones through masked output", () => {
    expect(formatPhone(null)).toBe("Não informado");
    expect(formatMaskedPhone("")).toBe("Não informado");
    expect(formatMaskedPhone("12345678901234567890")).toBe("Indisponível");
    expect(formatPhone("123")).toBe("Indisponível");
  });
  it("distinguishes zero, absent measurement and invalid count", () => {
    expect(formatCount(1234)).toBe("1.234");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(null)).toBe("Sem medições");
    expect(formatCount(Infinity)).toBe("Indisponível");
    expect(formatCount(NaN)).toBe("Indisponível");
  });
  it.each([[9, "Vence em 9 dias"], [0, "Vence hoje"], [1, "Vence amanhã"], [-1, "Venceu há 1 dia"], [-3, "Venceu há 3 dias"]])("formats expiration %s", (input, output) => {
    expect(formatDays(input as number)).toBe(output);
  });
  it("handles absent or invalid expiration", () => {
    expect(formatDays(null)).toBe("Não informado");
    expect(formatDays(NaN)).toBe("Indisponível");
    expect(formatDays(1.5)).toBe("Indisponível");
  });
});
