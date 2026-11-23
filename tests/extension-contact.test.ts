import { describe, expect, it, vi } from "vitest";
import { getDayStartIso } from "@/lib/whatsapp/operational-safety";
import { hasRecentExtensionContact, recordExtensionContact } from "@/lib/whatsapp/extension/heartbeat";

const now = new Date("2026-11-23T23:30:00Z");
type Admin = Parameters<typeof recordExtensionContact>[0];

describe("daily limit boundary", () => {
  it("starts at local midnight, including after 21:00 in Sao Paulo", () => {
    expect(getDayStartIso("America/Sao_Paulo", now)).toBe("2026-11-23T03:00:00.000Z");
    expect(getDayStartIso("America/Sao_Paulo", new Date("2026-11-24T01:00:00Z"))).toBe("2026-11-23T03:00:00.000Z");
    expect(getDayStartIso("America/Sao_Paulo", new Date("2026-11-24T03:00:00Z"))).toBe("2026-11-24T03:00:00.000Z");
    expect(getDayStartIso("UTC", now)).toBe("2026-11-23T00:00:00.000Z");
    // Daylight saving starts after midnight on this date.
    expect(getDayStartIso("America/New_York", new Date("2026-03-08T18:00:00Z"))).toBe("2026-03-08T05:00:00.000Z");
  });
});

describe("extension contact", () => {
  it("touches only updated_at, throttled, and never throws", async () => {
    const lt = vi.fn().mockResolvedValue({});
    const update = vi.fn(() => ({ eq: () => ({ lt }) }));
    await recordExtensionContact({ from: () => ({ update }) } as unknown as Admin, { connectedNumber: "5511999999999", extensionVersion: null }, now);
    expect(update).toHaveBeenCalledWith({ updated_at: now.toISOString() });
    expect(lt).toHaveBeenCalledWith("updated_at", "2026-11-23T23:29:00.000Z");
    await recordExtensionContact({ from: () => ({ update }) } as unknown as Admin, { connectedNumber: "", extensionVersion: null }, now);
    expect(update).toHaveBeenCalledTimes(1);
    await expect(recordExtensionContact({ from: () => { throw new Error("x"); } } as unknown as Admin, { connectedNumber: "1", extensionVersion: null })).resolves.toBeUndefined();
  });
  it("expires after ten minutes and rejects missing dates", () => {
    expect(hasRecentExtensionContact("2026-11-23T23:21:00Z", now)).toBe(true);
    expect(hasRecentExtensionContact("2026-11-23T23:19:00Z", now)).toBe(false);
    expect(hasRecentExtensionContact(null, now)).toBe(false);
  });
});
