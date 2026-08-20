export interface PageResult<TItem> {
  data: TItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export function normalizePageSize(requested: number | undefined, defaultSize = 20, maximumSize = 100): number {
  const size = requested ?? defaultSize;

  if (!Number.isInteger(size) || size <= 0) {
    throw new Error('Page size must be positive');
  }

  return Math.min(size, maximumSize);
}
