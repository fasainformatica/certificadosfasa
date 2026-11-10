import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
};

export function EmptyState({ title, description, icon: Icon = Inbox, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center border-y border-slate-200 bg-white px-5 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center text-slate-400">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-950">{title}</p>
      {description ? <p className="mt-1 max-w-lg text-sm leading-5 text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
