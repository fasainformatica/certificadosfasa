import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export function TableShell({ children, minWidth = "100%" }: { children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/80 text-xs text-slate-600">{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-200/80 [&_tr]:transition-colors [&_tr]:duration-150 [&_tr:hover]:bg-slate-50/80 [&_tr:focus-within]:bg-blue-50/50">{children}</tbody>;
}

export function TableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3.5 align-middle", className)}>{children}</td>;
}

export function TableHeaderCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th scope="col" className={cn("px-4 py-3 font-semibold", className)}>{children}</th>;
}
