import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-16 z-10 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white/95 p-2.5 shadow-[0_8px_24px_rgb(15_23_42/0.08)] backdrop-blur-md sm:bottom-3 sm:flex sm:flex-wrap sm:justify-end sm:gap-2.5 [&>button]:w-full sm:[&>button]:w-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}
