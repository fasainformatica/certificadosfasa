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
        "relative min-w-0 border-t border-slate-200 bg-white py-5",
        className,
      )}
    >
      {children}
    </section>
  );
}
