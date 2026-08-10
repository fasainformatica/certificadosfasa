import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/(internal)/notificacoes-internas/page.tsx"),
  "utf8",
);
const actionButtonSource = readFileSync(
  join(process.cwd(), "src/app/(internal)/notificacoes-internas/notification-state-button.tsx"),
  "utf8",
);

describe("internal notifications page", () => {
  it("mantem a rota protegida e reaplica visibilidade antes de consultar dados", () => {
    const authIndex = pageSource.indexOf("requireInternalUser()");
    const adminIndex = pageSource.indexOf("createSupabaseAdminClient()");
    const visibilityIndex = pageSource.indexOf("buildInternalNotificationVisibilityFilters");

    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(adminIndex).toBeGreaterThan(authIndex);
    expect(visibilityIndex).toBeGreaterThanOrEqual(0);
    expect(pageSource).toContain(".or(visibility.expiresAt)");
    expect(pageSource).toContain(".or(visibility.targetUser)");
    expect(pageSource).toContain(".or(visibility.targetRole)");
  });

  it("oferece historico, filtros e paginacao sem misturar com a central de avisos do WhatsApp", () => {
    expect(pageSource).toContain('title="Notificações internas"');
    expect(pageSource).toContain("Acompanhe atualizações de certificados");
    expect(pageSource).toContain("FilterBar");
    expect(pageSource).toContain("PaginationBar");
    expect(pageSource).toContain('basePath="/notificacoes-internas"');
    expect(pageSource).toContain("Ativas");
    expect(pageSource).toContain("Não lidas");
    expect(pageSource).toContain("Lidas");
    expect(pageSource).toContain("Dispensadas");
    expect(pageSource).toContain("Todos os tipos");
    expect(pageSource).toContain("Todas as prioridades");
  });

  it("usa tabela no desktop e cards no mobile para manter escaneabilidade", () => {
    expect(pageSource).toContain('className="grid gap-3 md:hidden"');
    expect(pageSource).toContain('className="hidden md:block"');
    expect(pageSource).toContain("<TableShell");
    expect(pageSource).toContain("<NotificationCard");
    expect(pageSource).toContain("Ver certificado");
    expect(actionButtonSource).toContain("Marcar lida");
    expect(actionButtonSource).toContain("Dispensar");
  });

  it("tem estados vazios e mensagens de erro orientadas a acao", () => {
    expect(pageSource).toContain("Nenhum resultado encontrado");
    expect(pageSource).toContain("Revise o termo pesquisado ou limpe os filtros.");
    expect(pageSource).toContain("Nenhuma notificação interna");
    expect(actionButtonSource).toContain("Não foi possível marcar como lida.");
    expect(actionButtonSource).toContain("Não foi possível dispensar a notificação.");
    expect(actionButtonSource).toContain('role="alert"');
  });

  it("nao expoe campos tecnicos ou sensiveis na apresentacao", () => {
    expect(pageSource).not.toContain("dedupe_key");
    expect(pageSource).not.toContain("storage_path");
    expect(pageSource).not.toContain("service_role");
    expect(pageSource).not.toContain("provider_response");
    expect(actionButtonSource).not.toContain("service_role");
  });
});
