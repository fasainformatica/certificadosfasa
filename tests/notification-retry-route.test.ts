import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/notifications/events/[id]/retry/route";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), write: vi.fn(), update: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/auth/api", () => ({ requireApiUser: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => {
  let writing = false;
  const chain = { select: () => chain, eq: () => chain, in: () => chain,
    update: (data: unknown) => { writing = true; mocks.update(data); return chain; },
    maybeSingle: () => writing ? mocks.write() : mocks.read(), insert: mocks.insert };
  return { from: () => chain };
} }));
const request = () => new NextRequest("http://localhost/api/notifications/events/test/retry", { method: "POST" });
const props = { params: Promise.resolve({ id: "test" }) };
async function invoke() {
  const response = await POST(request(), props);
  if (!response) throw new Error("Endpoint returned no response");
  return response;
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-23T15:00:00Z"));
  mocks.auth.mockResolvedValue({ user: { id: "operator", role: "admin" } });
  mocks.write.mockResolvedValue({ data: { id: "test", status: "retry" }, error: null });
  mocks.insert.mockResolvedValue({ error: null });
});
import { afterEach } from "vitest";
afterEach(() => vi.useRealTimers());
function event(reference: string | null, current: string, sendDate = "2026-07-01") {
  mocks.read.mockResolvedValue({ data: { id: "test", payload: reference ? { data_vencimento: reference } : {},
    send_date: sendDate, updated_at: "version", certificados: { data_vencimento: current } }, error: null });
}
describe("N11 retry endpoint", () => {
  it.each(["2027-01-01", "2026-01-01"])("rejects any changed validity %s without writes", async current => {
    event("2026-07-01", current);
    expect((await invoke()).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("allows matching validity even for an old schedule", async () => {
    event("2026-07-01", "2026-07-01"); expect((await invoke()).status).toBe(200);
  });
  it("rejects missing reference older than 30 calendar days", async () => {
    event(null, "2026-07-01", "2026-10-23"); expect((await invoke()).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["2026-10-24", "2026-11-23"])("allows missing reference at <=30 days: %s", async date => {
    event(null, "2026-07-01", date); expect((await invoke()).status).toBe(200);
  });
  it("rejects a failed verification without writes", async () => {
    mocks.read.mockResolvedValue({ data: null, error: {} });
    expect((await invoke()).status).toBe(503); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects missing current validity when a reference exists", async () => {
    mocks.read.mockResolvedValue({ data: { payload: { data_vencimento: "2026-07-01" }, send_date: "2026-11-23", updated_at: "version", certificados: null }, error: null });
    expect((await invoke()).status).toBe(409); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not report success if the event changed during verification", async () => {
    event("2026-07-01", "2026-07-01"); mocks.write.mockResolvedValue({ data: null, error: null });
    expect((await invoke()).status).toBe(404); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("keeps authorization before the privileged read", async () => {
    mocks.auth.mockResolvedValue({ response: new Response(null, { status: 403 }) });
    expect((await invoke()).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled();
  });
});
