import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-3 z-10 flex flex-wrap justify-end gap-2.5 rounded-3xl border border-white/75 bg-white/82 p-2.5 shadow-xl shadow-blue-950/10 ring-1 ring-blue-100/50 backdrop-blur-2xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
