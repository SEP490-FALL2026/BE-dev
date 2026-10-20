export function normalizePageSize(requested: number | undefined, defaultSize = 20, maximumSize = 100): number {
  const size = requested ?? defaultSize;

  if (!Number.isInteger(size) || size <= 0) {
    throw new Error('Page size must be positive');
  }

  return Math.min(size, maximumSize);
}

/** One page of a list, as a paged route answers it: the items, and where the page sits in the whole list. */
export interface Page<T> {
  items: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/** Page `page` of a list of `totalItems`, cut in pages of `pageSize`. */
export function pageOf<T>(items: T[], totalItems: number, page: number, pageSize: number): Page<T> {
  return { items, pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) } };
}
