import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
};

export function EmptyState({ title, description, icon: Icon = Inbox }: EmptyStateProps) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200/80 bg-blue-50/38 px-5 py-8 text-center shadow-inner shadow-white">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-lg shadow-blue-950/5 ring-1 ring-blue-100">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-950">{title}</p>
      {description ? <p className="mt-1 max-w-lg text-sm leading-5 text-slate-500">{description}</p> : null}
    </div>
  );
}
