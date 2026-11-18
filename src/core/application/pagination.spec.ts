import { normalizePageSize, pageOf } from './pagination';

describe('normalizePageSize', () => {
  it('uses the default when no size is requested', () => {
    expect(normalizePageSize(undefined)).toBe(20);
  });

  it('caps an excessive size', () => {
    expect(normalizePageSize(1_000)).toBe(100);
  });

  it('rejects non-positive values', () => {
    expect(() => normalizePageSize(0)).toThrow('Page size must be positive');
  });

  it('rejects a non-numeric requested size', () => {
    expect(() => normalizePageSize(Number('abc'))).toThrow('Page size must be positive');
  });

  it('rejects a fractional size', () => {
    expect(() => normalizePageSize(2.5)).toThrow('Page size must be positive');
  });

  it('rejects an infinite size', () => {
    expect(() => normalizePageSize(Number.POSITIVE_INFINITY)).toThrow('Page size must be positive');
  });
});

describe('pageOf', () => {
  it('answers the items with the page, its size, the total and the number of pages, rounded up', () => {
    expect(pageOf(['c'], 3, 2, 2)).toEqual({
      items: ['c'],
      pagination: { page: 2, pageSize: 2, totalItems: 3, totalPages: 2 },
    });
  });

  it('counts no page for an empty list, and keeps the page asked for', () => {
    expect(pageOf([], 0, 1, 20)).toEqual({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });
  });

  it('keeps the wire key order of every paged route', () => {
    const page = pageOf([1], 1, 1, 1);

    expect(Object.keys(page)).toEqual(['items', 'pagination']);
    expect(Object.keys(page.pagination)).toEqual(['page', 'pageSize', 'totalItems', 'totalPages']);
  });
});
