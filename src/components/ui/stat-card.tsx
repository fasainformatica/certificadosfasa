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
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  green: "bg-green-50 text-green-700 ring-green-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  red: "bg-red-50 text-red-700 ring-red-100",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function StatCard({ title, value, description, icon: Icon, tone = "blue" }: StatCardProps) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/75 bg-white/78 p-4 shadow-sm shadow-blue-950/5 ring-1 ring-blue-100/45 backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-blue-200/80 hover:bg-white/92 hover:shadow-lg hover:shadow-blue-950/10">
      <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent opacity-0 transition duration-200 group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 transition duration-200 group-hover:text-blue-950">{value}</p>
        </div>
        {Icon ? (
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ring-1 transition duration-200 group-hover:scale-105", tones[tone])}>
            <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
          </div>
        ) : null}
      </div>
      {description ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{description}</p> : null}
    </article>
  );
}
