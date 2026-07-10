import { BadgeCheck, Bell } from "lucide-react";
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
        <div className="flex w-full flex-col gap-2 px-3 py-2.5 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:px-5 xl:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-600/25 ring-1 ring-white/70">
              <BadgeCheck aria-hidden="true" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-4 text-blue-700">Fasa Informática</p>
              <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950">Certificados Digitais</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-blue-100 bg-white text-slate-500 shadow-sm shadow-blue-950/5 transition hover:-translate-y-0.5 hover:text-blue-700 sm:flex">
              <Bell aria-hidden="true" className="h-4 w-4" />
            </div>
            <div className="rounded-2xl border border-blue-100/80 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm shadow-blue-950/5">
              <span className="font-medium text-slate-950">{user.email ?? "Usuário interno"}</span>
              <span className="ml-2 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                {user.role === "admin" ? "Administrador" : "Financeiro"}
              </span>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="grid w-full gap-3 px-3 py-3 sm:px-4 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-5 lg:py-3 xl:px-6">
        <AppNavigation items={visibleNavigation} />
        <main className="min-w-0 pb-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
