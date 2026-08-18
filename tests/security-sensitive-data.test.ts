import { describe, expect, it } from "vitest";

import { getSafeOperationalErrorMessage, redactSensitiveText } from "@/lib/security/sensitive-data";

describe("sanitizacao de erros e dados sensiveis", () => {
  it("mascara segredos, storage path e telefone em textos tecnicos", () => {
    const jwt = ["eyJshort", "payload", "signature"].join(".");
    const storagePath = ["certificados", "30853193000194", "certificado.pfx"].join("/");
    const serviceRoleName = ["service", "role"].join("_");
    const text = `Authorization: Bearer ${jwt} ${serviceRoleName} ${storagePath} 5515999999999`;
    const redacted = redactSensitiveText(text);

    expect(redacted).toContain("Authorization=[redacted]");
    expect(redacted).toContain("[secret]");
    expect(redacted).toContain("[storage_path]");
    expect(redacted).toContain("[phone]");
    expect(redacted).not.toContain(jwt);
    expect(redacted).not.toContain(storagePath);
    expect(redacted).not.toContain("5515999999999");
  });

  it("troca erros SQL/RPC por mensagem operacional segura", () => {
    expect(getSafeOperationalErrorMessage(new Error("FOR UPDATE cannot be applied to the nullable side of an outer join"))).toBe(
      "Nao foi possivel reservar a proxima mensagem. Uma nova tentativa podera ser feita automaticamente.",
    );
  });

  it("troca erros de credencial e instancia por mensagens seguras", () => {
    expect(getSafeOperationalErrorMessage({ code: "AUTHENTICATION_ERROR", message: "401 unauthorized token=abc" })).toBe(
      "Nao foi possivel autenticar a integracao. Revise as credenciais server-side.",
    );
    expect(getSafeOperationalErrorMessage({ code: "INSTANCE_DISCONNECTED", message: "disconnected" })).toBe(
      "A instancia do WhatsApp esta desconectada.",
    );
  });
});
