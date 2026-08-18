import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  authenticateWindowsNotifier,
  buildWindowsNotifierVisibilityFilters,
  getWindowsNotifierConfigStatus,
} from "@/lib/internal-notifications/windows-notifier";

const routeSource = readFileSync(
  join(process.cwd(), "src/app/api/internal-notifications/windows/summary/route.ts"),
  "utf8",
);
const certificateFileRouteSource = readFileSync(
  join(process.cwd(), "src/app/api/certificados/[id]/arquivo/route.ts"),
  "utf8",
);
const windowsCertificateFileRouteSource = readFileSync(
  join(process.cwd(), "src/app/api/internal-notifications/windows/[id]/certificate-file/route.ts"),
  "utf8",
);
const notifierScript = readFileSync(join(process.cwd(), "tools/windows-notifier/FasaInternalNotifier.ps1"), "utf8");
const notifierBat = readFileSync(join(process.cwd(), "tools/windows-notifier/INICIAR_NOTIFICADOR_FASA.bat"), "utf8");
const notifierConfigExample = readFileSync(join(process.cwd(), "tools/windows-notifier/config.example.json"), "utf8");
const notifierInstallerSource = readFileSync(join(process.cwd(), "tools/windows-notifier/installer/Installer.cs"), "utf8");
const notifierInstallerBuild = readFileSync(join(process.cwd(), "tools/windows-notifier/installer/build-installer.ps1"), "utf8");
const wpfNotifierSource = readFileSync(join(process.cwd(), "tools/windows-notifier-app/FasaNotifierApp.cs"), "utf8");
const wpfNotifierReadme = readFileSync(join(process.cwd(), "tools/windows-notifier-app/README.md"), "utf8");
const wpfNotifierInstallerSource = readFileSync(
  join(process.cwd(), "tools/windows-notifier-app/installer/Installer.cs"),
  "utf8",
);
const wpfNotifierInstallerBuild = readFileSync(
  join(process.cwd(), "tools/windows-notifier-app/installer/build-installer.ps1"),
  "utf8",
);
const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");
const gitignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
const serviceRoleGuard = readFileSync(join(process.cwd(), "scripts/check-service-role-rbac.mjs"), "utf8");

const ENV_KEYS = ["WINDOWS_NOTIFIER_ENABLED", "WINDOWS_NOTIFIER_TOKEN", "WINDOWS_NOTIFIER_ROLE"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function requestWithToken(token: string | null) {
  return new Request("http://localhost/api/internal-notifications/windows/summary", {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

describe("windows notifier auth", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];

      if (value) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  it("fica desativado por padrao e exige token server-only", () => {
    expect(getWindowsNotifierConfigStatus()).toEqual({
      enabled: false,
      tokenConfigured: false,
      role: "financeiro",
    });
    expect(authenticateWindowsNotifier(requestWithToken("qualquer"))).toMatchObject({
      ok: false,
      code: "windows_notifier_disabled",
    });
  });

  it("valida Bearer token com comparacao segura", () => {
    process.env.WINDOWS_NOTIFIER_ENABLED = "true";
    process.env.WINDOWS_NOTIFIER_TOKEN = "secret-token";

    expect(authenticateWindowsNotifier(requestWithToken("wrong-token"))).toMatchObject({
      ok: false,
      code: "windows_notifier_token_invalid",
    });
    expect(authenticateWindowsNotifier(requestWithToken("secret-token"))).toEqual({
      ok: true,
      context: {
        role: "financeiro",
      },
    });
  });

  it("limita o papel usado pelo notificador a cargos internos conhecidos", () => {
    process.env.WINDOWS_NOTIFIER_ENABLED = "true";
    process.env.WINDOWS_NOTIFIER_TOKEN = "secret-token";
    process.env.WINDOWS_NOTIFIER_ROLE = "admin";

    expect(getWindowsNotifierConfigStatus().role).toBe("admin");
    expect(buildWindowsNotifierVisibilityFilters({ role: "financeiro", nowIso: "2026-08-10T10:00:00.000Z" })).toEqual({
      expiresAt: "expires_at.is.null,expires_at.gt.2026-08-10T10:00:00.000Z",
      targetRole: "target_role.is.null,target_role.eq.financeiro",
    });

    process.env.WINDOWS_NOTIFIER_ROLE = "owner";
    expect(getWindowsNotifierConfigStatus().role).toBe("financeiro");
  });
});

describe("windows notifier route and client package", () => {
  it("protege a rota do notificador antes de usar service role", () => {
    const authIndex = routeSource.indexOf("authenticateWindowsNotifier(request)");
    const adminIndex = routeSource.indexOf("createSupabaseAdminClient()");

    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(adminIndex).toBeGreaterThan(authIndex);
    expect(routeSource).toContain('.is("target_user_id", null)');
    expect(routeSource).toContain(".or(visibility.targetRole)");
    expect(routeSource).toContain("toInternalNotificationDto");
    expect(serviceRoleGuard).toContain("authenticateWindowsNotifier(");
  });

  it("nao expoe campos tecnicos ou segredos no endpoint de leitura", () => {
    expect(routeSource).not.toContain("dedupe_key");
    expect(routeSource).not.toContain("storage_path");
    expect(routeSource).not.toContain("service_role");
    expect(routeSource).not.toContain("provider_response");
  });

  it("entrega cliente Windows leve sem Supabase direto ou service role", () => {
    expect(notifierScript).toContain("/api/internal-notifications/windows/summary");
    expect(notifierScript).toContain('Authorization = "Bearer $($Config.Token)"');
    expect(notifierScript).toContain("Show-InternalNotificationWindow");
    expect(notifierScript).toContain("New-ActionButton");
    expect(notifierScript).toContain("Show-NotificationEntranceAnimation");
    expect(notifierScript).toContain("New-NotifierLogoBitmap");
    expect(notifierScript).toContain("fasa.ico");
    expect(notifierScript).toContain("FasaCertificadosInternalNotifier");
    expect(notifierScript).not.toContain("ShowBalloonTip");
    expect(notifierScript).toContain("createdAt");
    expect(notifierScript).toContain("config.local.json");
    expect(notifierScript).toContain("intervalSeconds");
    expect(notifierScript).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(notifierScript).not.toContain("createSupabase");
    expect(notifierBat).toContain("-ExecutionPolicy Bypass");
    expect(notifierBat).toContain("-WindowStyle Hidden");
  });

  it("documenta env e token sem gravar segredo real no repositorio", () => {
    expect(packageJson).toContain("security:generate-windows-notifier-token");
    expect(envExample).toContain("WINDOWS_NOTIFIER_ENABLED=false");
    expect(envExample).toContain("WINDOWS_NOTIFIER_TOKEN=");
    expect(envExample).toContain("WINDOWS_NOTIFIER_ROLE=financeiro");
    expect(notifierConfigExample).toContain("cole_o_mesmo_valor_do_WINDOWS_NOTIFIER_TOKEN");
    expect(gitignore).toContain("tools/windows-notifier/config.local.json");
    expect(gitignore).toContain("tools/windows-notifier/dist/");
    expect(notifierConfigExample).not.toContain("secret-token");
  });

  it("inclui instalador Windows por usuario com inicializacao automatica", () => {
    expect(notifierInstallerSource).toContain("FasaCertificadosNotifier");
    expect(notifierInstallerSource).toContain("CurrentUser.OpenSubKey");
    expect(notifierInstallerSource).toContain("Windows\\CurrentVersion\\Run");
    expect(notifierInstallerSource).toContain("config.local.json");
    expect(notifierInstallerSource).toContain("fasa.ico");
    expect(notifierInstallerSource).toContain("StartNotifier");
    expect(notifierInstallerSource).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(notifierInstallerBuild).toContain("InstalarNotificadorFasa.exe");
    expect(notifierInstallerBuild).toContain("FasaNotifierSetup");
  });

  it("inclui cliente WPF moderno sem depender de PowerShell para renderizar o popup", () => {
    expect(wpfNotifierSource).toContain("using System.Windows;");
    expect(wpfNotifierSource).toContain("/api/internal-notifications/windows/summary");
    expect(wpfNotifierSource).toContain("Bearer ");
    expect(wpfNotifierSource).toContain("DownloadHref");
    expect(wpfNotifierSource).toContain("WindowsDownloadHref");
    expect(wpfNotifierSource).toContain("DownloadLabel");
    expect(wpfNotifierSource).toContain("CertificadoId");
    expect(wpfNotifierSource).toContain("ResolveCertificateDownloadPath");
    expect(wpfNotifierSource).toContain("StartDownload");
    expect(wpfNotifierSource).toContain("DownloadCertificateToDownloads");
    expect(wpfNotifierSource).toContain("BuildDownloadFailureMessage");
    expect(wpfNotifierSource).toContain("O servidor ainda nao tem a rota de download direto publicada");
    expect(wpfNotifierSource).toContain("O token do notificador foi recusado");
    expect(wpfNotifierSource).toContain("GetDownloadsDirectory");
    expect(wpfNotifierSource).toContain("HttpRequestHeader.Authorization");
    expect(wpfNotifierSource).toContain("Baixar certificado");
    expect(wpfNotifierSource).toContain("NotificationWindow");
    expect(wpfNotifierSource).toContain("DropShadowEffect");
    expect(wpfNotifierSource).toContain("BeginEntranceAnimation");
    expect(wpfNotifierSource).toContain("activeWindows");
    expect(wpfNotifierSource).toContain("ArrangeNotificationWindows");
    expect(wpfNotifierSource).toContain("MoveTo");
    expect(wpfNotifierSource).toContain("FasaCertificadosInternalNotifier");
    expect(wpfNotifierSource).not.toContain("AutoCloseAfter");
    expect(wpfNotifierSource).not.toContain("accentTop");
    expect(wpfNotifierSource).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(wpfNotifierSource).not.toContain("createSupabase");
    expect(wpfNotifierSource).not.toContain("storage_path");
    expect(wpfNotifierSource).not.toContain("ProcessStartInfo(this.downloadUrl)");
    expect(wpfNotifierInstallerSource).toContain("FasaNotifierApp.exe");
    expect(wpfNotifierInstallerSource).toContain("FasaCertificadosNotifier");
    expect(wpfNotifierInstallerSource).toContain("Windows\\CurrentVersion\\Run");
    expect(wpfNotifierInstallerSource).toContain("ResetInstallDirectory");
    expect(wpfNotifierInstallerSource).toContain("EnsureSafeInstallDirectory");
    expect(wpfNotifierInstallerSource).toContain("Directory.Delete(installDir, true)");
    expect(wpfNotifierInstallerBuild).toContain("PresentationFramework.dll");
    expect(wpfNotifierInstallerBuild).toContain("FasaNotifierWpfSetup");
    expect(wpfNotifierInstallerBuild).toContain("InstalarNotificadorFasa.exe");
    expect(wpfNotifierInstallerBuild).toContain("InstalarNotificadorFasa-Unico.exe");
    expect(wpfNotifierInstallerBuild).toContain("SingleFileInstaller.generated.cs");
    expect(wpfNotifierInstallerBuild).toContain("$oldArtifact");
    expect(wpfNotifierInstallerBuild).toContain("[Convert]::ToBase64String");
    expect(wpfNotifierInstallerBuild).toContain("WriteEmbeddedFiles");
    expect(wpfNotifierInstallerBuild).toContain("ResetInstallDirectory");
    expect(wpfNotifierInstallerBuild).toContain("Directory.Delete(installDir, true)");
    expect(wpfNotifierReadme).toContain("WPF");
    expect(wpfNotifierReadme).toContain("InstalarNotificadorFasa-Unico.exe");
    expect(wpfNotifierReadme).toContain("confidencial");
    expect(gitignore).toContain("tools/windows-notifier-app/config.local.json");
    expect(gitignore).toContain("tools/windows-notifier-app/dist/");
  });

  it("baixa certificado pelo navegador autenticado sem dar privilegio ao token do notificador", () => {
    const authIndex = certificateFileRouteSource.indexOf("requireApiUser(OPERATIONAL_ROLES)");
    const adminIndex = certificateFileRouteSource.indexOf("createSupabaseAdminClient()");

    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(adminIndex).toBeGreaterThan(authIndex);
    expect(certificateFileRouteSource).toContain("createSignedUrl");
    expect(certificateFileRouteSource).toContain("NextResponse.redirect");
    expect(certificateFileRouteSource).toContain("download_certificado_interno");
    expect(certificateFileRouteSource).not.toContain("authenticateWindowsNotifier");
    expect(certificateFileRouteSource).not.toContain("WINDOWS_NOTIFIER_TOKEN");
    expect(wpfNotifierReadme).toContain("pasta `Downloads` do Windows");
    expect(wpfNotifierReadme).toContain("sem abrir Chrome, Edge ou qualquer navegador");
    expect(wpfNotifierReadme).toContain("Baixa certificados somente quando o usuario clica");
  });

  it("baixa certificado pelo endpoint do notificador sem abrir navegador", () => {
    const authIndex = windowsCertificateFileRouteSource.indexOf("authenticateWindowsNotifier(request)");
    const adminIndex = windowsCertificateFileRouteSource.indexOf("createSupabaseAdminClient()");

    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(adminIndex).toBeGreaterThan(authIndex);
    expect(windowsCertificateFileRouteSource).toContain("buildWindowsNotifierVisibilityFilters");
    expect(windowsCertificateFileRouteSource).toContain("CERTIFICATES_BUCKET");
    expect(windowsCertificateFileRouteSource).toContain("createSignedUrl(certificado.storage_path, 60");
    expect(windowsCertificateFileRouteSource).toContain("NextResponse.redirect");
    expect(windowsCertificateFileRouteSource).toContain("download_certificado_windows_notifier");
    expect(windowsCertificateFileRouteSource).not.toContain("requireApiUser");
    expect(windowsCertificateFileRouteSource).not.toContain(".download(certificado.storage_path)");
    expect(wpfNotifierSource).toContain('request.Headers[HttpRequestHeader.Authorization] = "Bearer " + this.downloadToken');
    expect(wpfNotifierSource).toContain('Path.Combine(userProfile, "Downloads")');
    expect(wpfNotifierSource).toContain("GetAvailableDownloadPath");
  });
});
