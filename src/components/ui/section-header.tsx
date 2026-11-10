import type { ReactNode } from "react";

type SectionHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function SectionHeader({ title, description, actions }: SectionHeaderProps) {
  return (
    <header className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight text-slate-950 sm:text-[30px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="grid w-full shrink-0 grid-cols-1 gap-2 sm:w-auto sm:grid-cols-none sm:flex sm:flex-wrap">{actions}</div> : null}
    </header>
  );
}
