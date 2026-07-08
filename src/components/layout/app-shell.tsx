import { BadgeCheck } from "lucide-react";
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
  { href: "/configuracoes", label: "Configuracoes", icon: "settings" },
] satisfies AppShellNavigationItem[];

type AppShellProps = {
  user: CurrentUser;
  children: ReactNode;
};

export function AppShell({ user, children }: AppShellProps) {
  const visibleNavigation = navigation.filter((item) => !item.adminOnly || user.role === "admin");

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f5f9ff] text-slate-950">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_8%_0%,rgba(37,99,235,0.16),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(14,165,233,0.14),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#f1f7ff_42%,#f8fafc_100%)]" />
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/78 shadow-sm shadow-blue-950/5 backdrop-blur-2xl">
        <div className="flex w-full flex-col gap-2.5 px-3 py-2.5 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:px-5 xl:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-lg shadow-blue-600/20 ring-1 ring-white/60">
              <BadgeCheck aria-hidden="true" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Fasa Informatica</p>
              <h1 className="truncate text-lg font-semibold tracking-normal text-slate-950">Certificados Digitais</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-slate-200/75 bg-white/78 px-3 py-1.5 text-sm text-slate-700 shadow-sm shadow-blue-950/5">
              <span className="font-medium text-slate-950">{user.email ?? "Usuario interno"}</span>
              <span className="ml-2 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                {user.role === "admin" ? "Administrador" : "Financeiro"}
              </span>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="grid w-full gap-4 px-3 py-4 sm:px-4 lg:grid-cols-[252px_minmax(0,1fr)] lg:px-5 lg:py-4 xl:px-6">
        <AppNavigation items={visibleNavigation} />
        <main className="min-w-0 pb-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
