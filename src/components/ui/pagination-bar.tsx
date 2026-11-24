import Link from "next/link";

import { buttonClass } from "@/components/ui/button-styles";
import { cn } from "@/lib/utils/cn";

type PaginationBarProps = {
  basePath: string;
  searchParams: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  itemLabel: string;
};

function buildHref(basePath: string, searchParams: Record<string, string | undefined>, page: number, pageSize: number) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== "page" && key !== "pageSize") {
      params.set(key, value);
    }
  }

  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return `${basePath}?${params.toString()}`;
}

export function PaginationBar({
  basePath,
  searchParams,
  page,
  pageSize,
  total,
  totalPages,
  itemLabel,
}: PaginationBarProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const previousPage = Math.max(page - 1, 1);
  const nextPage = Math.min(page + 1, totalPages);

  return (
    <nav
      className="flex flex-col gap-2 border-t border-slate-200 px-1 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"
      aria-label={`Paginação de ${itemLabel}`}
    >
      <p className="text-center sm:text-left">
        Mostrando {from}-{to} de {total} {itemLabel}.
      </p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex">
        <Link
          href={buildHref(basePath, searchParams, previousPage, pageSize)}
          aria-disabled={page <= 1}
          aria-label="Página anterior"
          className={cn(buttonClass("secondary", "min-h-9 px-3 text-xs"), page <= 1 && "pointer-events-none opacity-50")}
        >
          Anterior
        </Link>
        <span className="rounded-md bg-slate-100 px-3 py-1 text-center text-xs font-medium text-slate-700">
          Página {page} de {totalPages}
        </span>
        <Link
          href={buildHref(basePath, searchParams, nextPage, pageSize)}
          aria-disabled={page >= totalPages}
          aria-label="Próxima página"
          className={cn(
            buttonClass("secondary", "min-h-9 px-3 text-xs"),
            page >= totalPages && "pointer-events-none opacity-50",
          )}
        >
          Próxima
        </Link>
      </div>
    </nav>
  );
}
