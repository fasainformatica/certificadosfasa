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
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm shadow-slate-950/5 backdrop-blur-xl">
        <div className="flex w-full items-center justify-between gap-2 px-3 py-2.5 sm:px-4 lg:px-5 xl:px-6">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <FasaLogo className="h-10 w-10 sm:h-11 sm:w-11" priority />
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-4 text-blue-700 sm:text-sm">Fasa Informática</p>
              <h1 className="truncate text-base font-semibold tracking-normal text-slate-950 sm:text-lg">
                Certificados Digitais
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <InternalNotificationsMenu />
            {isAdmin ? (
              <Link
                href="/configuracoes"
                className="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm shadow-slate-950/5 transition hover:border-blue-200 hover:text-blue-700 sm:flex"
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

      <div className="grid w-full gap-4 px-3 py-4 pb-24 sm:px-4 lg:grid-cols-[248px_minmax(0,1fr)] lg:px-5 lg:pb-6 xl:px-6">
        <AppNavigation items={visibleNavigation} />
        <main className="min-w-0 pb-6 lg:max-w-[1680px]">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
