import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils/cn";

type AlertCardProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  tone?: "blue" | "amber" | "red" | "green";
};

const styles = {
  blue: "border-blue-200 bg-blue-50 text-blue-900",
  amber: "border-amber-200 bg-amber-50 text-amber-950",
  red: "border-red-200 bg-red-50 text-red-900",
  green: "border-green-200 bg-green-50 text-green-900",
};

export function AlertCard({ title, description, icon: Icon, tone = "blue" }: AlertCardProps) {
  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", styles[tone])}>
      <div className="flex gap-3">
        {Icon ? <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" /> : null}
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-6 opacity-90">{description}</p>
        </div>
      </div>
    </div>
  );
}
