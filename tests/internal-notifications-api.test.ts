import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildInternalNotificationIdFilter,
  isInternalNotificationSeverity,
  isInternalNotificationType,
  isUuid,
  parseInternalNotificationState,
  toInternalNotificationDto,
  type InternalNotificationApiRow,
  type InternalNotificationReadRow,
} from "@/lib/internal-notifications/presentation";
import { buildInternalNotificationVisibilityFilters, formatPostgrestInFilter } from "@/lib/internal-notifications/query";

const routeFiles = [
  "src/app/api/internal-notifications/route.ts",
  "src/app/api/internal-notifications/summary/route.ts",
  "src/app/api/internal-notifications/[id]/read/route.ts",
  "src/app/api/internal-notifications/[id]/dismiss/route.ts",
];

function readRoute(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("internal notifications api helpers", () => {
  it("valida filtros publicos da API", () => {
    expect(isInternalNotificationType("certificate_updated")).toBe(true);
    expect(isInternalNotificationType("provider_response")).toBe(false);
    expect(isInternalNotificationSeverity("warning")).toBe(true);
    expect(isInternalNotificationSeverity("critical")).toBe(false);
    expect(parseInternalNotificationState("dismissed")).toBe("dismissed");
    expect(parseInternalNotificationState("desconhecido")).toBe("active");
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuid("notificacao-1")).toBe(false);
  });

  it("calcula filtros por estado sem depender apenas da interface", () => {
    const readStates: InternalNotificationReadRow[] = [
      {
        notification_id: "11111111-1111-4111-8111-111111111111",
        user_id: "user-1",
        read_at: "2026-08-10T10:00:00.000Z",
        dismissed_at: null,
      },
      {
        notification_id: "22222222-2222-4222-8222-222222222222",
        user_id: "user-1",
        read_at: "2026-08-10T10:01:00.000Z",
        dismissed_at: "2026-08-10T10:02:00.000Z",
      },
    ];

    expect(buildInternalNotificationIdFilter("active", readStates)).toEqual({
      includeIds: [],
      excludeIds: ["22222222-2222-4222-8222-222222222222"],
      shouldReturnEmpty: false,
    });
    expect(buildInternalNotificationIdFilter("unread", readStates).excludeIds).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(buildInternalNotificationIdFilter("read", readStates)).toEqual({
      includeIds: ["11111111-1111-4111-8111-111111111111"],
      excludeIds: [],
      shouldReturnEmpty: false,
    });
    expect(buildInternalNotificationIdFilter("dismissed", [])).toEqual({
      includeIds: [],
      excludeIds: [],
      shouldReturnEmpty: true,
    });
  });

  it("apresenta notificacao sem expor dedupe_key ou dado de query interna", () => {
    const row: InternalNotificationApiRow = {
      id: "11111111-1111-4111-8111-111111111111",
      type: "certificate_updated",
      severity: "success",
      title: "Certificado atualizado",
      body: "Um certificado foi atualizado.",
      href: "/certificados/11111111-1111-4111-8111-111111111111",
      entity_type: "certificado",
      entity_id: "11111111-1111-4111-8111-111111111111",
      certificado_id: "11111111-1111-4111-8111-111111111111",
      cliente_id: null,
      target_role: null,
      target_user_id: null,
      actor_user_id: "33333333-3333-4333-8333-333333333333",
      metadata: { origem: "teste" },
      created_at: "2026-08-10T10:00:00.000Z",
      expires_at: null,
    };
    const dto = toInternalNotificationDto(row);

    expect(dto.title).toBe("Certificado atualizado");
    expect(dto.entityType).toBe("certificado");
    expect(dto.isRead).toBe(false);
    expect("dedupe_key" in dto).toBe(false);
  });

  it("monta filtros de visibilidade para service role reaplicar RBAC da tabela", () => {
    const filters = buildInternalNotificationVisibilityFilters({
      userId: "11111111-1111-4111-8111-111111111111",
      role: "financeiro",
      nowIso: "2026-08-10T10:00:00.000Z",
    });

    expect(filters.expiresAt).toContain("expires_at.is.null");
    expect(filters.targetUser).toContain("target_user_id.eq.11111111-1111-4111-8111-111111111111");
    expect(filters.targetRole).toContain("target_role.eq.financeiro");
    expect(formatPostgrestInFilter(["a", "b"])).toBe("(a,b)");
  });
});

describe("internal notifications routes", () => {
  it("validam RBAC antes de usar service role", () => {
    for (const routeFile of routeFiles) {
      const source = readRoute(routeFile);
      const authIndex = source.indexOf("requireApiUser(OPERATIONAL_ROLES)");
      const adminIndex = source.indexOf("createSupabaseAdminClient()");

      expect(authIndex, routeFile).toBeGreaterThanOrEqual(0);
      expect(adminIndex, routeFile).toBeGreaterThan(authIndex);
    }
  });

  it("nao expoe campos tecnicos sensiveis na listagem", () => {
    const source = readRoute("src/app/api/internal-notifications/route.ts");

    expect(source).not.toContain("dedupe_key");
    expect(source).not.toContain("service_role");
    expect(source).not.toContain("provider_response");
    expect(source).not.toContain("storage_path");
  });
});
