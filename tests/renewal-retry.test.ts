import { describe, expect, it } from "vitest";
import { getRenewalRetryPresentation } from "../src/lib/notifications/renewal-retry";

describe("N11 presentation only", () => {
  it("blocks the retry presentation after renewal", () => {
    expect(getRenewalRetryPresentation({ data_vencimento: "2026-07-17" }, "2027-07-17").renewed).toBe(true);
  });
  it("preserves retry presentation for unchanged validity", () => {
    expect(getRenewalRetryPresentation({ data_vencimento: "2026-07-17" }, "2026-07-17").renewed).toBe(false);
  });
  it("does not invent a reference for missing or malformed payloads", () => {
    for (const payload of [null, {}, [], { data_vencimento: "2026-02-31" }]) {
      expect(getRenewalRetryPresentation(payload, "2027-07-17")).toEqual({ referenceDate: null, renewed: false });
    }
  });
});
