import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptSecret } from "@/lib/crypto/secrets";
import { issueDownloadLink, prepareCertificateDownloadMessage, publicDownloadUrl } from "@/lib/download/delivery";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => mocks }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://certificados.example.test/");
  vi.stubEnv("CERT_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
});

describe("download delivery preparation", () => {
  it("encrypts outgoing credentials and reuses those returned by the database", async () => {
    mocks.rpc.mockImplementation(async (_name: string, args: { p_credentials: unknown }) => ({
      error: null, data: { status: "ready", id: "link", credentials: args.p_credentials },
    }));
    const result = await issueDownloadLink(createSupabaseAdminClient(), "certificate", { id: "event", reservation_id: "reservation" });
    expect(result?.url).toMatch(/^https:\/\/certificados.example.test\/download\//);
    const args = mocks.rpc.mock.calls[0][1];
    expect(JSON.stringify(args)).not.toContain(result?.password);
    expect(JSON.stringify(args)).not.toContain(result?.url.split("/").at(-1));
    const plaintext = JSON.parse(decryptSecret(args.p_credentials));
    expect(plaintext.password).toBe(result?.password);
    mocks.rpc.mockResolvedValue({ error: null, data: { status: "ready", id: "link", credentials: args.p_credentials } });
    expect(await issueDownloadLink(createSupabaseAdminClient(), "certificate", { id: "event", reservation_id: "reservation" })).toEqual(result);
  });
  it("keeps general/expiry messages unchanged, without issuing links", async () => {
    for (const type of ["internal_notice", "certificate_expiring", "certificate_created"]) {
      expect(await prepareCertificateDownloadMessage(createSupabaseAdminClient(), {
        id: "event", reservation_id: "reservation", type, mensagem_renderizada: "Original",
      })).toBe("Original");
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("adds only the temporary credential to an update message without mutating its persisted text", async () => {
    const chain = { select: () => chain, eq: () => chain,
      maybeSingle: async () => ({ data: { certificado_id: "certificate" }, error: null }) };
    mocks.from.mockReturnValue(chain);
    mocks.rpc.mockImplementation(async (_name: string, args: { p_credentials: unknown }) => ({
      error: null, data: { status: "ready", id: "link", credentials: args.p_credentials },
    }));
    const event = { id: "event", reservation_id: "reservation", type: "certificate_updated", mensagem_renderizada: "Cliente, CNPJ, novo vencimento" };
    const message = await prepareCertificateDownloadMessage(createSupabaseAdminClient(), event);
    expect(message).toContain("Cliente, CNPJ, novo vencimento");
    expect(message).toContain("https://certificados.example.test/download/");
    expect(message).toContain("Senha de acesso:");
    expect(message).toContain("uso unico");
    expect(event.mensagem_renderizada).toBe("Cliente, CNPJ, novo vencimento");
  });
  it("does not expose SQL errors or issue a fallback credential when the schema is missing", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "secret SQL info" }, data: null });
    await expect(issueDownloadLink(createSupabaseAdminClient(), "certificate")).rejects.toThrow("Nao foi possivel preparar o link de download.");
  });
  it("uses only the configured site origin and rejects insecure remote origins", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://certificados.example.test/path?q=ignored");
    expect(publicDownloadUrl("token")).toBe("https://certificados.example.test/download/token");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://other.example.test");
    expect(() => publicDownloadUrl("token")).toThrow();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3001");
    expect(publicDownloadUrl("token")).toBe("http://localhost:3001/download/token");
  });
  it("returns no link when the database applies the recipient threshold", async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: { status: "text_only" } });
    expect(await issueDownloadLink(createSupabaseAdminClient(), "certificate", { id: "event", reservation_id: "reservation" })).toBeNull();
  });
});
