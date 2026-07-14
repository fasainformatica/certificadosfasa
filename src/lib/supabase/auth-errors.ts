import "server-only";

export class InvalidAuthSessionError extends Error {
  constructor() {
    super("Sessao Supabase expirada ou invalida.");
    this.name = "InvalidAuthSessionError";
  }
}

export function isInvalidRefreshTokenError(error: unknown) {
  const maybeError = error as {
    code?: string;
    message?: string;
    name?: string;
    status?: number;
  };
  const message = maybeError.message?.toLowerCase() ?? "";
  const code = maybeError.code?.toLowerCase() ?? "";

  return (
    maybeError.name === "AuthApiError" &&
    maybeError.status === 400 &&
    (code === "refresh_token_not_found" ||
      code === "invalid_refresh_token" ||
      message.includes("invalid refresh token") ||
      message.includes("refresh token not found"))
  );
}

export function sessionCleanupRedirectPath() {
  return "/api/auth/logout?reason=session-expired";
}
