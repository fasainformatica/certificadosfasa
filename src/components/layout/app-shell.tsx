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
    <div className="fasa-app min-h-screen overflow-x-hidden">
      <a href="#main-content" className="sr-only rounded-md bg-white px-4 py-2 font-semibold text-blue-700 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70]">Ir para o conteúdo principal</a>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/96 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1920px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <FasaLogo className="h-9 w-9 sm:h-10 sm:w-10" priority />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold leading-4 text-blue-700 sm:text-xs">Fasa Informática</p>
              <p className="truncate text-sm font-semibold text-slate-950 sm:text-base">
                Certificados Digitais
              </p>
            </div>
          </div>

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

      <div className="mx-auto grid w-full max-w-[1920px] gap-5 px-4 py-6 pb-24 sm:px-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:pb-10">
        <AppNavigation items={visibleNavigation} />
        <main id="main-content" className="min-w-0 pb-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
