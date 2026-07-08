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
        "relative overflow-hidden rounded-2xl border border-white/75 bg-white/78 p-4 shadow-sm shadow-blue-950/5 ring-1 ring-blue-100/45 backdrop-blur-xl transition duration-200 hover:border-blue-200/70 hover:bg-white/92 hover:shadow-lg hover:shadow-blue-950/10 sm:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}
