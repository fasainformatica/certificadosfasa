import type { ReactNode } from "react";

type SectionHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function SectionHeader({ title, description, actions }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-white/70 bg-white/58 px-4 py-3 shadow-sm shadow-blue-950/5 ring-1 ring-blue-100/40 backdrop-blur-2xl md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="mb-2 h-1 w-10 rounded-full bg-gradient-to-r from-blue-600 to-sky-400" />
        <h2 className="text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">{title}</h2>
        {description ? <p className="mt-1 max-w-4xl text-sm leading-5 text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
