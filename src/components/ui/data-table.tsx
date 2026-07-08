import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export function TableShell({ children, minWidth = "100%" }: { children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/75 bg-white/82 shadow-sm shadow-blue-950/5 ring-1 ring-blue-100/45 backdrop-blur-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-slate-200/80 bg-slate-50/86 text-[11px] uppercase tracking-[0.1em] text-slate-500">{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100/90">{children}</tbody>;
}

export function TableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={cn("h-14 px-3.5 py-2.5 align-middle", className)}>{children}</td>;
}

export function TableHeaderCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={cn("px-3.5 py-3 font-semibold", className)}>{children}</th>;
}
