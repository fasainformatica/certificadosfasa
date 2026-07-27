import { describe, expect, it } from "vitest";

import { ADMIN_ROLES, OPERATIONAL_ROLES, canAccessAdminOnlyArea, canManageOperationalData } from "@/lib/auth/permissions";

describe("permissoes internas", () => {
  it("mantem financeiro como operador completo fora de WhatsApp e configuracoes", () => {
    expect(OPERATIONAL_ROLES).toEqual(["admin", "financeiro"]);
    expect(canManageOperationalData("admin")).toBe(true);
    expect(canManageOperationalData("financeiro")).toBe(true);
  });

  it("mantem areas administrativas restritas ao admin", () => {
    expect(ADMIN_ROLES).toEqual(["admin"]);
    expect(canAccessAdminOnlyArea("admin")).toBe(true);
    expect(canAccessAdminOnlyArea("financeiro")).toBe(false);
  });
});
