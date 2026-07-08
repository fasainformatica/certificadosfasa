"use client";

import {
  BarChart3,
  FileKey2,
  MessageSquareText,
  Send,
  Settings,
  UsersRound,
} from "lucide-react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
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
  const reduceMotion = useReducedMotion();

  return (
    <nav aria-label="Navegacao principal" className="lg:sticky lg:top-[76px] lg:self-start">
      <LazyMotion features={domAnimation}>
        <div className="flex gap-2 overflow-x-auto rounded-3xl border border-white/70 bg-white/70 p-2 shadow-xl shadow-blue-950/5 ring-1 ring-blue-100/50 backdrop-blur-2xl lg:grid lg:gap-1.5 lg:overflow-visible">
          {items.map((item) => {
            const Icon = navigationIcons[item.icon];
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative inline-flex h-10 shrink-0 items-center gap-3 overflow-hidden rounded-2xl px-3 text-sm font-semibold outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
                  active
                    ? "text-white shadow-lg shadow-blue-600/20"
                    : "text-slate-600 hover:-translate-y-0.5 hover:bg-white/86 hover:text-blue-700 hover:shadow-sm hover:shadow-blue-950/5",
                )}
              >
                {active ? (
                  <m.span
                    layoutId="active-navigation-item"
                    className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500"
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
                  />
                ) : null}
                <span
                  className={cn(
                    "relative flex h-8 w-8 items-center justify-center rounded-xl transition duration-200 group-hover:scale-105",
                    active
                      ? "bg-white/20 text-white ring-1 ring-white/20"
                      : "bg-slate-100 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600",
                  )}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="relative whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </LazyMotion>
    </nav>
  );
}
