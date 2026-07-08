import "server-only";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type PaginationResult = {
  page: number;
  pageSize: number;
  from: number;
  to: number;
};

export function parsePagination(searchParams: URLSearchParams): PaginationResult {
  const rawPage = Number(searchParams.get("page") ?? "1");
  const rawPageSize = Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize =
    Number.isFinite(rawPageSize) && rawPageSize > 0
      ? Math.min(Math.floor(rawPageSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return { page, pageSize, from, to };
}

export function createPaginationMeta(total: number | null | undefined, page: number, pageSize: number) {
  const safeTotal = Math.max(Number(total ?? 0), 0);
  const totalPages = Math.max(Math.ceil(safeTotal / pageSize), 1);

  return {
    page,
    pageSize,
    total: safeTotal,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}
