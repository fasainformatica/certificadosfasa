import { Settings } from "lucide-react";
import Link from "next/link";
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
    <div className="fasa-app min-h-screen overflow-x-hidden lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <a href="#main-content" className="sr-only rounded-md bg-white px-4 py-2 font-semibold text-blue-700 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70]">Ir para o conteúdo principal</a>
      <aside className="hidden min-h-screen border-r border-[#283345] bg-[#172232] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <FasaLogo className="h-8 w-8" priority />
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold text-white">Fasa</p>
            <p className="text-[11px] text-slate-400">Certificados Digitais</p>
          </div>
        </div>
        <AppNavigation items={visibleNavigation} />
        <div className="mt-auto border-t border-white/10 px-5 py-4 text-xs text-slate-400">
          <p className="truncate text-slate-200" title={user.email ?? undefined}>{user.email ?? "Usuário"}</p>
          <p className="mt-1 capitalize">{user.role}</p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <AppNavigation items={visibleNavigation} mobileOnly />
              <FasaLogo className="h-8 w-8" priority />
              <span className="truncate text-sm font-semibold text-slate-900">Fasa Certificados</span>
            </div>
            <span className="hidden text-xs font-medium text-slate-500 lg:block">Painel administrativo</span>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <InternalNotificationsMenu />
            {isAdmin ? (
              <Link
                href="/configuracoes"
                className="hidden h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 sm:flex"
                aria-label="Abrir configurações"
                title="Configurações"
              >
                <Settings aria-hidden="true" className="h-4 w-4" />
              </Link>
            ) : null}
            <LogoutButton />
            </div>
          </div>
        </header>
        <main id="main-content" className="mx-auto w-full max-w-[1600px] min-w-0 px-4 py-6 pb-12 sm:px-6 lg:px-10 lg:py-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
