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
  blue: "bg-blue-100/80 text-blue-700 ring-blue-200/80 shadow-blue-600/10",
  green: "bg-green-100/80 text-green-700 ring-green-200/80 shadow-green-600/10",
  amber: "bg-orange-100/80 text-orange-700 ring-orange-200/80 shadow-orange-600/10",
  red: "bg-red-100/80 text-red-700 ring-red-200/80 shadow-red-600/10",
  slate: "bg-slate-100 text-slate-700 ring-slate-200 shadow-slate-600/10",
};

export function StatCard({ title, value, description, icon: Icon, tone = "blue" }: StatCardProps) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-blue-100/70 bg-white p-3 shadow-sm shadow-blue-950/5 ring-1 ring-white/80 transition duration-150 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md hover:shadow-blue-950/10">
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-600" title={typeof title === "string" ? title : undefined}>{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 transition duration-150 group-hover:text-blue-950">{value}</p>
        </div>
        {Icon ? (
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ring-1 transition duration-150 group-hover:scale-105", tones[tone])}>
            <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
          </div>
        ) : null}
      </div>
      {description ? <p className="relative mt-1 text-xs leading-5 text-slate-500" title={description}>{description}</p> : null}
    </article>
  );
}
