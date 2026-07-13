import type { ReactNode } from "react";

export function FilterBar({ children, columns = "md:grid-cols-[1fr_auto]" }: { children: ReactNode; columns?: string }) {
  return (
    <form className={`mb-4 grid gap-2 rounded-2xl border border-blue-100/70 bg-white/82 p-2.5 shadow-sm shadow-blue-950/5 ring-1 ring-white/80 backdrop-blur-xl sm:gap-2.5 sm:rounded-3xl sm:p-3 [&>button]:w-full sm:[&>button]:w-auto ${columns}`}>
      {children}
    </form>
  );
}
