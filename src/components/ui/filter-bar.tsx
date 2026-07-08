import type { ReactNode } from "react";

export function FilterBar({ children, columns = "md:grid-cols-[1fr_auto]" }: { children: ReactNode; columns?: string }) {
  return (
    <form className={`mb-4 grid gap-2.5 rounded-2xl border border-white/75 bg-white/76 p-3 shadow-sm shadow-blue-950/5 ring-1 ring-blue-100/45 backdrop-blur-xl ${columns}`}>
      {children}
    </form>
  );
}
