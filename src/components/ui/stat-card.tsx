import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type StatCardProps = {
  title: string;
  value: ReactNode;
  description?: string;
  icon?: LucideIcon;
  tone?: "blue" | "green" | "amber" | "red" | "slate";
};

const tones = {
  blue: "text-slate-950",
  green: "text-emerald-800",
  amber: "text-amber-800",
  red: "text-red-800",
  slate: "text-slate-950",
};

export function StatCard({ title, value, description, icon: Icon, tone = "blue" }: StatCardProps) {
  return (
    <article className="relative min-w-0 border-b border-slate-200 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:px-5 sm:py-5 sm:last:border-r-0">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-medium leading-5 text-slate-600" title={title}>{title}</p>
        {Icon ? (
          <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
        ) : null}
      </div>
      <p className={`mt-2 break-words text-[1.65rem] font-semibold leading-none tabular-nums ${tones[tone]}`}>{value}</p>
      {description ? <p className="mt-2 text-xs leading-5 text-slate-500" title={description}>{description}</p> : null}
    </article>
  );
}
