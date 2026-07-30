import { describe, expect, it } from "vitest";

import { getLoginErrorMessage } from "@/lib/auth/login-presentation";

describe("login presentation", () => {
  it("usa erro claro para credenciais invalidas", () => {
    expect(getLoginErrorMessage("invalid_credentials")).toBe(
      "Não foi possível entrar. Confira o e-mail e a senha e tente novamente.",
    );
  });

  it("nao expoe detalhe tecnico quando o servico de autenticacao falha", () => {
    const message = getLoginErrorMessage("auth_service_unavailable");

    expect(message).toBe("Não foi possível conectar ao serviço de autenticação. Tente novamente em instantes.");
    expect(message).not.toContain("Supabase");
    expect(message).not.toContain("token");
  });
});
