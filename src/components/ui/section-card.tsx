import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type SectionCardProps = {
  children: ReactNode;
  className?: string;
};

export function SectionCard({ children, className }: SectionCardProps) {
  return (
    <section
      className={cn(
        "relative min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-[var(--shadow-subtle)] sm:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}
