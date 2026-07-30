export type LoginErrorReason = "invalid_credentials" | "auth_service_unavailable";

export function getLoginErrorMessage(reason: LoginErrorReason) {
  if (reason === "invalid_credentials") {
    return "Não foi possível entrar. Confira o e-mail e a senha e tente novamente.";
  }

  return "Não foi possível conectar ao serviço de autenticação. Tente novamente em instantes.";
}
