import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const menuSource = readFileSync(
  join(process.cwd(), "src/components/layout/internal-notifications-menu.tsx"),
  "utf8",
);
const shellSource = readFileSync(join(process.cwd(), "src/components/layout/app-shell.tsx"), "utf8");

describe("internal notifications menu", () => {
  it("integra o sininho real no shell interno", () => {
    expect(shellSource).toContain("InternalNotificationsMenu");
    expect(shellSource).not.toContain("<Bell aria-hidden");
  });

  it("consulta os endpoints internos esperados", () => {
    expect(menuSource).toContain("/api/internal-notifications/summary");
    expect(menuSource).toContain("/api/internal-notifications?state=active&pageSize=6");
    expect(menuSource).toContain("/api/internal-notifications/${notificationId}/${action}");
    expect(menuSource).toContain('method: "POST"');
    expect(menuSource).toContain('credentials: "same-origin"');
    expect(menuSource).toContain("latest_notification");
    expect(menuSource).toContain("fasa:internal-notifications:refresh");
  });

  it("mantem atributos acessiveis e estados de feedback", () => {
    expect(menuSource).toContain('aria-haspopup="dialog"');
    expect(menuSource).toContain("aria-expanded={open}");
    expect(menuSource).toContain('role="dialog"');
    expect(menuSource).toContain('role="status"');
    expect(menuSource).toContain("Não foi possível carregar");
    expect(menuSource).toContain("Nenhuma notificação interna");
    expect(menuSource).toContain('href="/notificacoes-internas"');
    expect(menuSource).toContain("Ver central completa");
    expect(menuSource).toContain("Ativar pop-ups");
    expect(menuSource).toContain("Desativar pop-ups");
    expect(menuSource).toContain("Pop-ups ativados.");
  });

  it("solicita permissao de popup apenas por acao explicita do usuario", () => {
    expect(menuSource).toContain("window.Notification.requestPermission()");
    expect(menuSource).toContain("enableBrowserNotifications");
    expect(menuSource).toContain("disableBrowserNotifications");
    expect(menuSource).toContain("INTERNAL_BROWSER_NOTIFICATIONS_ENABLED_KEY");
    expect(menuSource).toContain("INTERNAL_BROWSER_NOTIFICATIONS_LAST_SEEN_KEY");
  });

  it("nao expoe campos tecnicos ou sensiveis no componente de apresentacao", () => {
    expect(menuSource).not.toContain("dedupe_key");
    expect(menuSource).not.toContain("storage_path");
    expect(menuSource).not.toContain("service_role");
    expect(menuSource).not.toContain("provider_response");
  });
});
