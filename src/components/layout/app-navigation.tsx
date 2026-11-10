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
import { useCallback, useEffect, useId, useRef, useState } from "react";

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

  return pending ? (
    <span className="ml-auto flex h-4 w-4 shrink-0 items-center" role="status">
      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
      <span className="sr-only">Carregando</span>
    </span>
  ) : null;
}

export function AppNavigation({ items, mobileOnly = false }: { items: NavigationItem[]; mobileOnly?: boolean }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const closeMobileMenu = useCallback(() => {
    setMobileOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLButtonElement>("button")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMobileMenu();
      }

      if (event.key === "Tab" && drawer) {
        const focusable = Array.from(drawer.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
        const first = focusable[0];
        const last = focusable.at(-1);

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen, closeMobileMenu]);

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
          "group relative inline-flex min-h-11 shrink-0 items-center gap-3 rounded-md px-3 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#172232]",
          active
            ? "bg-white/10 text-white before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-blue-400"
            : "text-slate-300 hover:bg-white/5 hover:text-white",
        )}
      >
        <span
          className={cn(
            "relative flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150",
            active ? "text-blue-300" : "text-slate-400 group-hover:text-slate-200",
          )}
        >
          <Icon aria-hidden="true" className="h-[17px] w-[17px]" />
        </span>
        <span className="relative min-w-0">{item.label}</span>
        <NavigationPendingIndicator />
      </Link>
    );
  }

  return (
    <>
      {!mobileOnly ? <nav aria-label="Navegação principal" className="hidden flex-1 px-3 py-5 lg:block">
        <div className="flex flex-col gap-1">
          {items.map((item) => renderLink(item))}
        </div>
      </nav> : null}

      {mobileOnly ? <button
        ref={menuButtonRef}
        type="button"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600 lg:hidden"
        aria-label="Abrir navegação"
        aria-controls={drawerId}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(true)}
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
      </button> : null}

      {mobileOnly && mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden"
          aria-label="Fechar navegação"
          onClick={closeMobileMenu}
        />
      ) : null}

      {mobileOnly ? <aside
        ref={drawerRef}
        id={drawerId}
        role="dialog"
        aria-modal={mobileOpen ? "true" : undefined}
        inert={!mobileOpen}
        aria-label="Navegação principal"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(20rem,86vw)] flex-col border-r border-white/10 bg-[#172232] p-4 shadow-xl transition-transform duration-200 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">Fasa Certificados</p>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 text-slate-200 outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-400"
            aria-label="Fechar navegação"
            onClick={closeMobileMenu}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <nav className="grid gap-1">{items.map((item) => renderLink(item, () => setMobileOpen(false)))}</nav>
      </aside> : null}
    </>
  );
}
