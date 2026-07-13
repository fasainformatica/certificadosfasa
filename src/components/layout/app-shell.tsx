import { BadgeCheck, Bell, Settings } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppNavigation } from "@/components/layout/app-navigation";
import type { NavigationItem } from "@/components/layout/app-navigation";
import { LogoutButton } from "@/components/layout/logout-button";
import { PageTransition } from "@/components/layout/page-transition";
import type { CurrentUser } from "@/lib/auth/rbac";

type AppShellNavigationItem = NavigationItem & {
  adminOnly?: boolean;
};

const navigation = [
  { href: "/dashboard", label: "Painel", icon: "dashboard" },
  { href: "/certificados", label: "Certificados", icon: "certificates" },
  { href: "/clientes", label: "Clientes", icon: "clients" },
  { href: "/notificacoes", label: "Avisos", icon: "notifications" },
  { href: "/whatsapp", label: "WhatsApp Bot", icon: "whatsapp", adminOnly: true },
  { href: "/configuracoes", label: "Configurações", icon: "settings" },
] satisfies AppShellNavigationItem[];

type AppShellProps = {
  user: CurrentUser;
  children: ReactNode;
};

export function AppShell({ user, children }: AppShellProps) {
  const visibleNavigation = navigation.filter((item) => !item.adminOnly || user.role === "admin");

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f6f9ff] text-slate-950">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,#fbfdff_0%,#f2f7ff_42%,#f8fafc_100%)]" />
      <header className="sticky top-0 z-30 border-b border-blue-100/75 bg-white/90 shadow-sm shadow-blue-950/5 backdrop-blur-xl">
        <div className="flex w-full items-center justify-between gap-2 px-3 py-2 sm:px-4 lg:px-5 xl:px-6">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-600/25 ring-1 ring-white/70 sm:h-11 sm:w-11">
              <BadgeCheck aria-hidden="true" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-4 text-blue-700 sm:text-sm">Fasa Informática</p>
              <h1 className="truncate text-base font-semibold tracking-tight text-slate-950 sm:text-lg">
                Certificados Digitais
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-blue-100 bg-white text-slate-500 shadow-sm shadow-blue-950/5 transition hover:-translate-y-0.5 hover:text-blue-700 sm:flex">
              <Bell aria-hidden="true" className="h-4 w-4" />
            </div>
            <Link
              href="/configuracoes"
              className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-blue-100 bg-white text-slate-500 shadow-sm shadow-blue-950/5 transition hover:-translate-y-0.5 hover:text-blue-700 sm:flex"
              aria-label="Abrir configurações"
              title="Configurações"
            >
              <Settings aria-hidden="true" className="h-4 w-4" />
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="grid w-full gap-3 px-3 py-3 pb-24 sm:px-4 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-5 lg:py-3 lg:pb-3 xl:px-6">
        <AppNavigation items={visibleNavigation} />
        <main className="min-w-0 pb-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
