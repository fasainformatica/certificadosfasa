import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export function TableShell({ children, minWidth = "100%" }: { children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-blue-100/70 bg-white/86 shadow-sm shadow-blue-950/5 ring-1 ring-white/80 backdrop-blur-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-blue-100/80 bg-blue-50/70 text-[11px] uppercase tracking-[0.1em] text-slate-500">{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100/90">{children}</tbody>;
}

export function TableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={cn("h-[60px] px-4 py-3 align-middle", className)}>{children}</td>;
}

export function TableHeaderCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={cn("px-4 py-3.5 font-semibold", className)}>{children}</th>;
}
