import type { ReactNode } from "react";

type SectionHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function SectionHeader({ title, description, actions }: SectionHeaderProps) {
  return (
    <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-blue-100/70 bg-white px-3 py-3 shadow-sm shadow-blue-950/5 ring-1 ring-white/80 sm:px-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="mb-2 h-1 w-10 rounded-full bg-blue-600" />
        <h2 className="text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">{title}</h2>
        {description ? <p className="mt-1 max-w-4xl text-sm leading-5 text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="grid w-full shrink-0 grid-cols-1 gap-2 sm:w-auto sm:grid-cols-none sm:flex sm:flex-wrap">{actions}</div> : null}
    </div>
  );
}
