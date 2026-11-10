import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type StatCardProps = {
  title: string;
  value: ReactNode;
  description?: string;
  icon?: LucideIcon;
  tone?: "blue" | "green" | "amber" | "red" | "slate";
};

const tones = {
  blue: "text-blue-700 bg-blue-50",
  green: "text-emerald-700 bg-emerald-50",
  amber: "text-amber-800 bg-amber-50",
  red: "text-red-700 bg-red-50",
  slate: "text-slate-600 bg-slate-100",
};

export function StatCard({ title, value, description, icon: Icon, tone = "blue" }: StatCardProps) {
  return (
    <article className="relative min-w-0 rounded-lg border border-slate-200 bg-white p-3.5 shadow-[var(--shadow-subtle)] sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-medium leading-5 text-slate-600" title={title}>{title}</p>
        {Icon ? (
          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", tones[tone])}>
            <Icon aria-hidden="true" className="h-4 w-4" />
          </div>
        ) : null}
      </div>
      <p className="mt-2 break-words text-[1.75rem] font-semibold leading-none tabular-nums text-slate-950">{value}</p>
      {description ? <p className="mt-2 min-h-5 text-xs leading-5 text-slate-600" title={description}>{description}</p> : null}
    </article>
  );
}
