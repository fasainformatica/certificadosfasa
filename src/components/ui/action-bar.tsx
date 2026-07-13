import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-20 z-10 grid grid-cols-1 gap-2 rounded-3xl border border-white/75 bg-white/88 p-2.5 shadow-xl shadow-blue-950/10 ring-1 ring-blue-100/50 backdrop-blur-2xl sm:bottom-3 sm:flex sm:flex-wrap sm:justify-end sm:gap-2.5 [&>button]:w-full sm:[&>button]:w-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}
