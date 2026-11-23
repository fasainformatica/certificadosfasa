import type { ReactNode } from "react";

type SectionHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function SectionHeader({ title, description, actions }: SectionHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-subtitle mt-1 max-w-3xl">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full shrink-0 flex-wrap gap-2 md:w-auto">{actions}</div> : null}
    </header>
  );
}
