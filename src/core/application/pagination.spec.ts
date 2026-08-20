import { normalizePageSize } from './pagination';

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
