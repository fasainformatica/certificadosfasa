"use client";

import {
  BarChart3,
  FileKey2,
  Loader2,
  Menu,
  MessageSquareText,
  Send,
  Settings,
  UsersRound,
  X,
} from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

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

function NavigationPendingIndicator() {
  const { pending } = useLinkStatus();

  return (
    <span className="ml-auto flex h-4 w-4 shrink-0 items-center" role="status">
      {pending ? (
        <>
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          <span className="sr-only">Carregando</span>
        </>
      ) : null}
    </span>
  );
}

export function AppNavigation({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerId = useId();

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  function renderLink(item: NavigationItem, onNavigate?: () => void) {
    const Icon = navigationIcons[item.icon];
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "group relative inline-flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-semibold outline-none transition duration-150 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
          active
            ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
        )}
      >
        <span
          className={cn(
            "relative flex h-8 w-8 items-center justify-center rounded-lg transition duration-150",
            active ? "bg-white text-blue-700 ring-1 ring-blue-100" : "bg-slate-100 text-slate-500 group-hover:text-slate-700",
          )}
        >
          <Icon aria-hidden="true" className="h-[17px] w-[17px]" />
        </span>
        <span className="relative min-w-0 truncate">{item.label}</span>
        <NavigationPendingIndicator />
      </Link>
    );
  }

  return (
    <>
      <nav aria-label="Navegação principal" className="hidden lg:sticky lg:top-[76px] lg:block lg:self-start">
        <div className="flex min-h-[calc(100vh-96px)] flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm shadow-slate-950/5">
          {items.map((item) => renderLink(item))}
        </div>
      </nav>

      <button
        type="button"
        className="fixed bottom-4 left-4 z-40 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-lg shadow-slate-950/10 outline-none transition hover:border-blue-200 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 lg:hidden"
        aria-controls={drawerId}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(true)}
      >
        <Menu aria-hidden="true" className="h-4 w-4" />
        Menu
      </button>

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden"
          aria-label="Fechar navegação"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        id={drawerId}
        aria-label="Navegação principal"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(20rem,86vw)] flex-col border-r border-slate-200 bg-white p-4 shadow-2xl shadow-slate-950/20 transition-transform duration-200 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-950">Navegação</p>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            aria-label="Fechar navegação"
            onClick={() => setMobileOpen(false)}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <nav className="grid gap-1">{items.map((item) => renderLink(item, () => setMobileOpen(false)))}</nav>
      </aside>
    </>
  );
}
