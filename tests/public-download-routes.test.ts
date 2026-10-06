import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/lib/crypto/secrets";
import { POST as validate } from "@/app/api/download/[token]/validar/route";
import { POST as file } from "@/app/api/download/[token]/arquivo/route";
import { hashDownloadPassword } from "@/lib/download/password";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), maybeSingle: vi.fn(), insert: vi.fn(), download: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => {
  mocks.admin();
  const chain = { select: () => chain, eq: () => chain, maybeSingle: mocks.maybeSingle, insert: mocks.insert };
  return { from: () => chain, rpc: mocks.rpc, storage: { from: () => ({ download: mocks.download }) } };
} }));
const token = "t".repeat(43);
const session = "s".repeat(43);
const props = { params: Promise.resolve({ token }) };
function request(body: unknown) {
  return new NextRequest(`http://localhost/api/download/${token}/arquivo`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CERT_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
  mocks.insert.mockResolvedValue({ error: null });
});

describe("public download routes", () => {
  it("rejects malformed sessions before privileged access", async () => {
    expect((await file(request({ action: "download", session: "short" }), props)).status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("validates password and atomically claims a session before returning the PFX password", async () => {
    const encrypted = encryptSecret("PFX-password-fixture");
    mocks.maybeSingle.mockResolvedValue({ data: { id: "link", ativo: true, usado: false,
      senha_hash: await hashDownloadPassword("temporary-fixture"), tentativas_invalidas: 0, bloqueado_ate: null }, error: null });
    mocks.rpc.mockResolvedValue({ data: { status: "authorized", id: "link", certificate_id: "certificate", filename: "certificate.pfx", ...encrypted }, error: null });
    const response = await validate(request({ senha_liberacao: "temporary-fixture" }), props);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.senha_certificado).toBe("PFX-password-fixture");
    expect(body.session).toHaveLength(43);
    expect(body).not.toHaveProperty("download_url");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(body.session);
    expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain("PFX-password-fixture");
    expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain(token);
  });
  it("wrong password records a failed attempt but returns no session or PFX password", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ativo: true, usado: false,
      senha_hash: await hashDownloadPassword("correct-password") }, error: null });
    mocks.rpc.mockResolvedValue({ data: { status: "wrong_password" }, error: null });
    const response = await validate(request({ senha_liberacao: "wrong-password" }), props);
    expect(response.status).toBe(400);
    expect(mocks.rpc.mock.calls[0][1].p_action).toBe("failed_password");
    expect(await response.json()).not.toHaveProperty("session");
  });
  it("proxies only an authorized file without disclosing a signed URL or private storage path", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "ready", storage_path: "private/file.pfx", filename: "Client.pfx" }, error: null });
    mocks.download.mockResolvedValue({ data: new Blob(["fixture-pfx-bytes"]), error: null });
    const response = await file(request({ action: "download", session }), props);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("fixture-pfx-bytes");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("x-transfer-id")).toBeTruthy();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain("private/file.pfx");
  });
  it("does not access storage for used, missing or concurrently transferring links", async () => {
    for (const status of ["unavailable", "busy"]) {
      mocks.rpc.mockResolvedValue({ data: { status }, error: null });
      const response = await file(request({ action: "download", session }), props);
      expect(response.status).toBe(status === "busy" ? 409 : 404);
    }
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("releases the same transfer on storage failure and exposes only a safe recovery message", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { status: "ready", storage_path: "private/file.pfx" }, error: null })
      .mockResolvedValueOnce({ data: { status: "released" }, error: null });
    mocks.download.mockResolvedValue({ data: null, error: { message: "private storage credential" } });
    const response = await file(request({ action: "download", session }), props);
    expect(response.status).toBe(502);
    expect(mocks.rpc.mock.calls[1][1].p_action).toBe("release");
    expect(mocks.rpc.mock.calls[1][1].p_transfer_id).toBe(mocks.rpc.mock.calls[0][1].p_transfer_id);
    expect(JSON.stringify(await response.json())).not.toContain("private storage credential");
  });
  it("acknowledges receipt without streaming a second file", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "complete" }, error: null });
    const response = await file(request({ action: "complete", session, transfer_id: "10000000-0000-4000-8000-000000000001" }), props);
    expect(await response.json()).toEqual({ completed: true });
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
