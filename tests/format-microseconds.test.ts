import { expect, it } from "vitest";
import { formatDateTime } from "@/lib/format";

it("accepts PostgreSQL microsecond timestamps", () => {
  expect(formatDateTime("2026-11-20T03:00:55.804123+00:00")).toBe("20/11/2026 às 00:00");
});
