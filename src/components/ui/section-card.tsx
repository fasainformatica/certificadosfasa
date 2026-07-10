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
        "relative overflow-hidden rounded-2xl border border-blue-100/70 bg-white p-3 shadow-sm shadow-blue-950/5 ring-1 ring-white/80 transition duration-150 hover:border-blue-200 hover:shadow-md hover:shadow-blue-950/10 sm:p-4",
        className,
      )}
    >
      {children}
    </section>
  );
}
