import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { ADMIN_ROLES } from "@/lib/auth/permissions";

const auth = vi.hoisted(() => ({ allowed: true, check: vi.fn() }));
const rebuild = vi.hoisted(() => vi.fn(async () => ({ eventos_criados: 0 })));
let client: ReturnType<typeof createClient<Database>>;
const writes: unknown[] = [];
const selects: string[] = [];

vi.mock("@/lib/auth/api", () => ({ requireApiUser: async (roles: readonly string[]) => {
  auth.check(roles);
  return auth.allowed ? { user: { id: "actor" } } : { response: new Response(null, { status: 403 }) };
} }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client }));
vi.mock("@/lib/notifications/engine", () => ({ rebuildNotificationSchedule: rebuild }));

import { GET, POST } from "@/app/api/notifications/recipients/route";
import { PATCH } from "@/app/api/notifications/recipients/[id]/route";

beforeEach(() => {
  auth.allowed = true;
  auth.check.mockClear();
  rebuild.mockClear();
  writes.length = 0;
  selects.length = 0;
  client = createClient<Database>("https://example.supabase.co", "unit-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      selects.push(url.searchParams.get("select") ?? "");
      if (init?.method === "HEAD") return new Response(null, { headers: { "content-range": "0-0/1" } });
      if (init?.body) writes.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ id: "recipient", notify_general: false, notify_certificate_updates: true }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    } },
  });
});

describe("recipient API preferences", () => {
  it("returns the two fields and requires admin access", async () => {
    expect((await GET())?.status).toBe(200);
    expect(auth.check).toHaveBeenCalledWith(ADMIN_ROLES);
    expect(selects[0]).toContain("notify_general");
    expect(selects[0]).toContain("notify_certificate_updates");
  });

  it("persists update-only recipients through POST", async () => {
    const response = await POST(new NextRequest("http://localhost/api/notifications/recipients", {
      method: "POST", body: JSON.stringify({ nome: "Equipe", telefone: "11999999999", notify_general: false, notify_certificate_updates: true }),
    }));
    expect(response?.status).toBe(201);
    expect(writes).toEqual([expect.objectContaining({ notify_general: false, notify_certificate_updates: true })]);
    expect(rebuild).toHaveBeenCalledOnce();
  });

  it.each([{ nome: "Novo nome" }, { notify_general: false }, { notify_certificate_updates: true }])("PATCH persists only supplied fields %j", async (patch) => {
    const response = await PATCH(new NextRequest("http://localhost/api/notifications/recipients/id", {
      method: "PATCH", body: JSON.stringify(patch),
    }), { params: Promise.resolve({ id: "recipient" }) });
    expect(response?.status).toBe(200);
    expect(writes).toEqual([patch]);
  });

  it("rejects non-boolean preferences without writing", async () => {
    const response = await PATCH(new NextRequest("http://localhost/api/notifications/recipients/id", {
      method: "PATCH", body: JSON.stringify({ notify_general: "false" }),
    }), { params: Promise.resolve({ id: "recipient" }) });
    expect(response?.status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("does not read or write recipient settings for unauthorized callers", async () => {
    auth.allowed = false;
    expect((await GET())?.status).toBe(403);
    expect((await POST(new NextRequest("http://localhost", { method: "POST" })))?.status).toBe(403);
    expect((await PATCH(new NextRequest("http://localhost", { method: "PATCH" }), { params: Promise.resolve({ id: "recipient" }) }))?.status).toBe(403);
    expect(selects).toEqual([]);
    expect(writes).toEqual([]);
    expect(rebuild).not.toHaveBeenCalled();
  });
});
