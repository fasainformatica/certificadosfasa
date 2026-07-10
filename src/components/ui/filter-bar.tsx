import type { ReactNode } from "react";

export function FilterBar({ children, columns = "md:grid-cols-[1fr_auto]" }: { children: ReactNode; columns?: string }) {
  return (
    <form className={`mb-4 grid gap-2.5 rounded-3xl border border-blue-100/70 bg-white/82 p-3 shadow-sm shadow-blue-950/5 ring-1 ring-white/80 backdrop-blur-xl ${columns}`}>
      {children}
    </form>
  );
}
