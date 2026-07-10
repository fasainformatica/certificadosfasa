"use client";

import {
  BarChart3,
  FileKey2,
  Headphones,
  MessageSquareText,
  Send,
  Settings,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

export type NavigationItem = {
  href: string;
  label: string;
  icon: keyof typeof navigationIcons;
};

const navigationIcons = {
  dashboard: BarChart3,
  certificates: FileKey2,
  clients: UsersRound,
  notifications: Send,
  whatsapp: MessageSquareText,
  settings: Settings,
};

export function AppNavigation({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegação principal" className="lg:sticky lg:top-[76px] lg:self-start">
      <div className="flex gap-2 overflow-x-auto rounded-3xl border border-blue-100/75 bg-white/90 p-2 shadow-sm shadow-blue-950/5 ring-1 ring-white/80 lg:min-h-[calc(100vh-94px)] lg:flex-col lg:overflow-visible lg:p-3">
        <div className="flex gap-2 lg:flex-col lg:gap-1.5">
          {items.map((item) => {
            const Icon = navigationIcons[item.icon];
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative inline-flex h-11 shrink-0 items-center gap-3 rounded-2xl px-3 text-sm font-semibold outline-none transition duration-150 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
                  active
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                    : "text-slate-600 hover:-translate-y-0.5 hover:bg-blue-50 hover:text-blue-700",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-8 w-8 items-center justify-center rounded-2xl transition duration-150 group-hover:scale-105",
                    active ? "bg-white/20 text-white ring-1 ring-white/25" : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-blue-600",
                  )}
                >
                  <Icon aria-hidden="true" className="h-[17px] w-[17px]" />
                </span>
                <span className="relative whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="hidden lg:mt-auto lg:block">
          <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm shadow-blue-950/5 ring-1 ring-blue-100">
              <Headphones aria-hidden="true" className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-950">Precisa de ajuda?</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Suporte interno para operação dos certificados.</p>
            <a
              href="mailto:suporte@fasainformatica.com.br"
              className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-2xl border border-blue-100 bg-white px-3 text-xs font-semibold text-blue-700 shadow-sm shadow-blue-950/5 transition duration-150 hover:-translate-y-0.5 hover:bg-blue-50"
            >
              Falar com suporte
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
}
