import { describe, expect, it } from "vitest";

import { evaluateProductionEnvironment } from "@/lib/operations/production-readiness";

const validEnv = {
  NODE_ENV: "test",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  CERT_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  CRON_SECRET: "x".repeat(32),
  NEXT_PUBLIC_SITE_URL: "https://fasa.example.com",
  EUATENDO_PROVIDER_ENABLED: "false",
} as NodeJS.ProcessEnv;

describe("production readiness", () => {
  it("aceita ambiente minimo com euAtendo automatico desabilitado", () => {
    const checks = evaluateProductionEnvironment(validEnv);

    expect(checks.filter((item) => item.severity === "critical").every((item) => item.ok)).toBe(true);
  });

  it("exige token e instancia quando euAtendo automatico esta habilitado", () => {
    const checks = evaluateProductionEnvironment({
      ...validEnv,
      EUATENDO_PROVIDER_ENABLED: "true",
      EUATENDO_API_TOKEN: "",
      EUATENDO_INSTANCE_ID: "",
    });
    const euAtendo = checks.find((item) => item.id === "euatendo_credentials");

    expect(euAtendo?.ok).toBe(false);
    expect(euAtendo?.severity).toBe("critical");
  });

  it("exige feature flag e token quando a extensao e o provider ativo", () => {
    const checks = evaluateProductionEnvironment({
      ...validEnv,
      WHATSAPP_PROVIDER: "whatsapp_extension",
      WHATSAPP_EXTENSION_ENABLED: "false",
      WHATSAPP_EXTENSION_TOKEN: "",
    });
    const extension = checks.find((item) => item.id === "whatsapp_extension_credentials");

    expect(extension?.ok).toBe(false);
    expect(extension?.severity).toBe("critical");
  });

  it("falha quando chave de criptografia nao tem 32 bytes em base64", () => {
    const checks = evaluateProductionEnvironment({
      ...validEnv,
      CERT_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64"),
    });
    const encryption = checks.find((item) => item.id === "cert_encryption_key");

    expect(encryption?.ok).toBe(false);
  });
});
