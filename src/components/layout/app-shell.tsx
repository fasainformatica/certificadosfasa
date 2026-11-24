import type { ReactNode } from "react";

import { FasaLogo } from "@/components/brand/fasa-logo";
import { AppNavigation } from "@/components/layout/app-navigation";
import { InternalNotificationsMenu } from "@/components/layout/internal-notifications-menu";
import type { NavigationItem } from "@/components/layout/app-navigation";
import { LogoutButton } from "@/components/layout/logout-button";
import { PageTransition } from "@/components/layout/page-transition";
import { canAccessAdminOnlyArea } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/rbac";

type AppShellNavigationItem = NavigationItem & {
  adminOnly?: boolean;
};

const navigation = [
  { href: "/dashboard", label: "Visão geral", icon: "dashboard" },
  { href: "/certificados", label: "Certificados", icon: "certificates" },
  { href: "/clientes", label: "Clientes", icon: "clients" },
  { href: "/notificacoes", label: "Central de avisos", icon: "notifications" },
  { href: "/whatsapp", label: "WhatsApp", icon: "whatsapp", adminOnly: true },
  { href: "/configuracoes", label: "Configurações", icon: "settings", adminOnly: true },
] satisfies AppShellNavigationItem[];

type AppShellProps = {
  user: CurrentUser;
  children: ReactNode;
};

export function AppShell({ user, children }: AppShellProps) {
  const isAdmin = canAccessAdminOnlyArea(user.role);
  const visibleNavigation = navigation.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="fasa-app min-h-screen lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <a href="#main-content" className="sr-only rounded-md bg-white px-4 py-2 font-semibold text-blue-700 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70]">Ir para o conteúdo principal</a>
      <aside className="hidden min-h-screen bg-[var(--sidebar-bg)] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-white/[0.08] px-4">
          <FasaLogo className="h-8 w-8" priority />
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold text-white">Fasa</p>
            <p className="text-xs leading-4 text-[var(--sidebar-text)]">Certificados Digitais</p>
          </div>
        </div>
        <AppNavigation items={visibleNavigation} />
        <div className="mt-auto border-t border-white/[0.08] p-4 text-xs leading-4 text-[var(--sidebar-text)]">
          <p className="truncate text-[13px] leading-[18px] text-white" title={user.email ?? undefined}>{user.email ?? "Não informado"}</p>
          <p className="mt-1 capitalize">{user.role}</p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
          <div className="flex h-16 w-full items-center justify-between gap-3 px-4 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <AppNavigation items={visibleNavigation} mobileOnly />
              <span className="text-[13px] leading-[18px] text-[var(--text-3)]">Painel administrativo</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
            <InternalNotificationsMenu />
            <LogoutButton />
            </div>
          </div>
        </header>
        <main id="main-content" className="w-full min-w-0 p-4 lg:p-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
